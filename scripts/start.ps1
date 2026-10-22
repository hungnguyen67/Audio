$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pythonExecutable = Join-Path $root '.venv\Scripts\python.exe'
$backendFile = Join-Path $root 'backend\app\main.py'

if (-not (Test-Path $pythonExecutable)) {
    throw "Python virtual environment not found: $pythonExecutable"
}

if (-not (Test-Path $backendFile)) {
    throw "Backend file not found: $backendFile"
}

$edgeTtsVersion = & $pythonExecutable -c "import edge_tts; print(edge_tts.__version__)"
if ($LASTEXITCODE -ne 0) {
    throw "Could not read edge-tts version from $pythonExecutable"
}

$backendListener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($backendListener) {
    $processIds = ($backendListener | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    $runtimeVerified = $false
    try {
        $runtime = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/runtime-info' -TimeoutSec 3
        if ($runtime.pythonExecutable -and $runtime.edgeTtsVersion) {
            $expectedPython = [System.IO.Path]::GetFullPath($pythonExecutable)
            $runningPython = [System.IO.Path]::GetFullPath($runtime.pythonExecutable)
            if ($runningPython -ine $expectedPython -or $runtime.edgeTtsVersion -ne $edgeTtsVersion) {
                throw "Backend on port 3001 (PID $processIds) uses Python '$($runtime.pythonExecutable)' and edge-tts $($runtime.edgeTtsVersion), but this project requires '$expectedPython' and edge-tts $edgeTtsVersion. Wait for active audio jobs to finish, then restart with this script."
            }
            if ($runtime.chunkSize -ne 1000 -or $runtime.chunkConcurrency -ne 3) {
                throw "Backend on port 3001 (PID $processIds) is running outdated audio chunk settings (size $($runtime.chunkSize), concurrency $($runtime.chunkConcurrency)); this project requires size 1000 and concurrency 3. Wait for active audio jobs to finish, then stop and restart the backend."
            }
            $runtimeVerified = $true
        }
    } catch {
        if ($_.Exception.Message -like 'Backend on port 3001*') { throw }
    }
    if (-not $runtimeVerified) {
        $expectedPython = [System.IO.Path]::GetFullPath($pythonExecutable)
        foreach ($processId in ($backendListener | Select-Object -ExpandProperty OwningProcess -Unique)) {
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
            $parentInfo = if ($processInfo) {
                Get-CimInstance Win32_Process -Filter "ProcessId=$($processInfo.ParentProcessId)" -ErrorAction SilentlyContinue
            }
            $runningPython = if ($processInfo) { [System.IO.Path]::GetFullPath($processInfo.ExecutablePath) } else { $null }
            $parentPython = if ($parentInfo) { [System.IO.Path]::GetFullPath($parentInfo.ExecutablePath) } else { $null }
            if ($runningPython -ine $expectedPython -and $parentPython -ine $expectedPython) {
                throw "Backend on port 3001 (PID $processId) cannot be verified as using this project's Python environment. Wait for active audio jobs to finish, then restart with this script."
            }
        }
    }
    Write-Host "Backend already running on port 3001 (PID $processIds) with edge-tts $edgeTtsVersion; attaching without stopping active audio jobs."
    $backendProcess = $null
} else {
    Write-Host "Starting backend with edge-tts $edgeTtsVersion"

    $backendProcess = Start-Process $pythonExecutable `
        -ArgumentList @('-m', 'app.main') `
        -WorkingDirectory (Join-Path $root 'backend') `
        -NoNewWindow `
        -PassThru
    Write-Host "Backend started with PID $($backendProcess.Id)"
}

$frontendListener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($frontendListener) {
    $processIds = ($frontendListener | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    Write-Host "Frontend already running on port 3000 (PID $processIds)."
    $frontendProcess = $null
} else {
    $frontendProcess = Start-Process npm.cmd `
        -ArgumentList @('run', 'dev') `
        -WorkingDirectory (Join-Path $root 'frontend') `
        -WindowStyle Hidden `
        -PassThru
    Write-Host "Frontend started with PID $($frontendProcess.Id)"
}
Write-Host 'Frontend: http://127.0.0.1:3000'
Write-Host 'Audio progress is read from the database. Press Ctrl+C to stop monitoring.'

$monitorCode = @'
import json
import sys
import time

sys.path.insert(0, sys.argv[1])
import app.main as edge_tts_server

query = (
    "SELECT ca.id, ca.status, ca.error_message, c.chapter_number, c.title, "
    "TIMESTAMPDIFF(SECOND, ca.updated_at, NOW()) AS generation_seconds, "
    "(SELECT COUNT(*) FROM audio_chunks ac WHERE ac.chapter_audio_id = ca.id) AS chunks, "
    "(SELECT MAX(created_at) FROM audio_chunks ac WHERE ac.chapter_audio_id = ca.id) AS last_chunk, "
    "TIMESTAMPDIFF(SECOND, COALESCE("
    "(SELECT MAX(created_at) FROM audio_chunks ac WHERE ac.chapter_audio_id = ca.id), ca.created_at), "
    "NOW()) AS seconds_since_progress "
    "FROM chapters c JOIN chapter_audios ca ON ca.chapter_id = c.id "
    "AND ca.voice = %s AND ca.content_hash = SHA2(c.content, 256) "
    "AND ca.status <> 'ready' "
    "ORDER BY ca.updated_at DESC LIMIT 10"
)
queue_query = (
    "SELECT COUNT(*) AS total_chapters, "
    "COALESCE(SUM(EXISTS (SELECT 1 FROM chapter_audios ca "
    "WHERE ca.chapter_id = c.id AND ca.voice = %s "
    "AND ca.content_hash = SHA2(c.content, 256) AND ca.status = 'ready')), 0) AS ready, "
    "COALESCE(SUM(EXISTS (SELECT 1 FROM chapter_audios ca "
    "WHERE ca.chapter_id = c.id AND ca.voice = %s "
    "AND ca.content_hash = SHA2(c.content, 256) AND ca.status = 'generating')), 0) AS generating, "
    "COALESCE(SUM(NOT EXISTS (SELECT 1 FROM chapter_audios ca "
    "WHERE ca.chapter_id = c.id AND ca.voice = %s "
    "AND ca.content_hash = SHA2(c.content, 256) AND ca.status = 'ready') "
    "AND NOT EXISTS (SELECT 1 FROM chapter_audios ca "
    "WHERE ca.chapter_id = c.id AND ca.voice = %s "
    "AND ca.content_hash = SHA2(c.content, 256) AND ca.status = 'generating' "
    ") "
    "AND NOT EXISTS (SELECT 1 FROM chapter_audios failed_ca "
    "WHERE failed_ca.chapter_id = c.id AND failed_ca.voice = %s "
    "AND failed_ca.content_hash = SHA2(c.content, 256) AND failed_ca.status = 'error' "
    f"AND failed_ca.updated_at >= NOW() - INTERVAL {edge_tts_server.AUTO_AUDIO_RETRY_MINUTES} MINUTE)), 0) AS waiting, "
    "COALESCE(SUM(EXISTS (SELECT 1 FROM chapter_audios failed_ca "
    "WHERE failed_ca.chapter_id = c.id AND failed_ca.voice = %s "
    "AND failed_ca.content_hash = SHA2(c.content, 256) AND failed_ca.status = 'error' "
    f"AND failed_ca.updated_at >= NOW() - INTERVAL {edge_tts_server.AUTO_AUDIO_RETRY_MINUTES} MINUTE)), 0) AS retry_wait "
    "FROM chapters c"
)
voice = f"edge:{edge_tts_server.VOICE}"
last_snapshot = None
last_report = 0

try:
    while True:
        try:
            connection = edge_tts_server.get_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(queue_query, (voice, voice, voice, voice, voice, voice))
            queue = cursor.fetchone()
            cursor.execute(query, (voice,))
            jobs = cursor.fetchall()
            now = time.time()
            cursor.close()
            connection.close()

            snapshot_jobs = [
                {key: value for key, value in job.items() if key != "seconds_since_progress"}
                for job in jobs
            ]
            snapshot = json.dumps({"jobs": snapshot_jobs, "queue": queue}, ensure_ascii=True, default=str, sort_keys=True)
            if snapshot != last_snapshot or now - last_report >= 30:
                if not jobs:
                    print(
                        "[audio monitor] "
                        f'{queue["waiting"]} chapter(s) waiting for automatic audio, '
                        f'{queue["generating"]} generating, {queue["ready"]} ready, '
                        f'{queue["retry_wait"]} waiting to retry after an error.',
                        flush=True,
                    )
                else:
                    print(
                        "[audio monitor] Queue: "
                        f'{queue["waiting"]} waiting, {queue["generating"]} generating, '
                        f'{queue["ready"]} ready, {queue["retry_wait"]} waiting to retry.',
                        flush=True,
                    )
                    for job in jobs:
                        title = job["title"].encode("ascii", "backslashreplace").decode("ascii")
                        last_chunk = job["last_chunk"] or "none yet"
                        generation_seconds = job["generation_seconds"]
                        elapsed = (
                            f'{generation_seconds // 60}m {generation_seconds % 60}s'
                            if job["status"] == "generating"
                            else "n/a"
                        )
                        message = (
                            f'[audio monitor] Chapter {job["chapter_number"]} "{title}": '
                            f'{job["status"]} for {elapsed}, '
                            f'no new chunk for {job["seconds_since_progress"]}s, '
                            f'{job["chunks"]} audio chunks saved, '
                            f'last chunk {last_chunk}.'
                        )
                        if job["error_message"]:
                            message += f' Error: {job["error_message"]}'
                        print(message, flush=True)
                last_snapshot = snapshot
                last_report = now
        except Exception as error:
            print(f"[audio monitor] Could not read audio progress: {error}", flush=True)

        time.sleep(5)
except KeyboardInterrupt:
    print("[audio monitor] Stopped.", flush=True)
'@

$monitorCodeBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($monitorCode))
$monitorCommand = "import base64; exec(base64.b64decode('$monitorCodeBase64'))"

try {
    & $pythonExecutable -u -c $monitorCommand (Join-Path $root 'backend')
}
finally {
    foreach ($process in @($backendProcess, $frontendProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}