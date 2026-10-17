$ErrorActionPreference = 'Stop'

$backendListener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($backendListener) {
    $processIds = ($backendListener | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Audio backend is already listening on port 3001 (PID $processIds). Stop that backend before restarting so the updated .venv is used."
}

$pythonExecutable = Join-Path $PSScriptRoot '..\.venv\Scripts\python.exe'
$edgeTtsVersion = & $pythonExecutable -c "import edge_tts; print(edge_tts.__version__)"
if ($LASTEXITCODE -ne 0) {
    throw "Could not read edge-tts version from $pythonExecutable"
}
Write-Host "Starting backend with edge-tts $edgeTtsVersion"

& $pythonExecutable (Join-Path $PSScriptRoot 'edge_tts_server.py')
