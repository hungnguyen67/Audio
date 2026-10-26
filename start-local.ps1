param(
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$backendPath = Join-Path $root 'backend'
$frontendPath = Join-Path $root 'frontend'
$pythonExecutable = Join-Path $root '.venv\Scripts\python.exe'
$backendEntryPoint = Join-Path $backendPath 'app\main.py'
$frontendPackage = Join-Path $frontendPath 'package.json'

function ConvertTo-PowerShellLiteral {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Get-ListeningProcessIds {
    param([int]$Port)

    return @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Test-Endpoint {
    param(
        [string]$Url,
        [string]$Name
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
            throw "$Name returned HTTP $($response.StatusCode)."
        }
    } catch {
        throw "$Name is already using its port but is not responding successfully at $Url. $($_.Exception.Message)"
    }
}

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw "Project Python environment not found at '$pythonExecutable'. Create it with 'python -m venv .venv', then install dependencies with '.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt'."
}
if (-not (Test-Path -LiteralPath $backendEntryPoint)) {
    throw "Backend entry point not found: $backendEntryPoint"
}
if (-not (Test-Path -LiteralPath $frontendPackage)) {
    throw "Frontend package manifest not found: $frontendPackage"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js and npm are required. Install Node.js, then reopen PowerShell.'
}

& $pythonExecutable -c "import edge_tts, mysql.connector"
if ($LASTEXITCODE -ne 0) {
    throw "Backend Python dependencies are missing. Install them with '.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt'."
}
if (-not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules'))) {
    throw "Frontend dependencies are missing. Install them with 'npm ci' in the frontend folder."
}

Push-Location $backendPath
try {
    & $pythonExecutable -c "from app.repositories.database import get_connection; connection = get_connection(); connection.close(); print('MySQL connection: OK')"
    if ($LASTEXITCODE -ne 0) {
        throw 'Cannot connect to MySQL. Start the local MySQL service and verify DB settings in backend\app\core\config.py.'
    }
} finally {
    Pop-Location
}

if ($CheckOnly) {
    Write-Host 'Startup checks passed.'
    return
}

$backendPort = 3001
$frontendPort = 3000
$backendUrl = "http://127.0.0.1:$backendPort/api/stories"
$frontendUrl = "http://127.0.0.1:$frontendPort/"
$serverJobs = @()

try {
$backendListeners = Get-ListeningProcessIds -Port $backendPort
if ($backendListeners.Count -gt 0) {
    Test-Endpoint -Url $backendUrl -Name 'Backend'
    foreach ($processId in $backendListeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
        if (-not $process -or $process.CommandLine -notmatch '(?:^|\s)-m\s+app\.main(?:\s|$)') {
            throw "Port $backendPort is occupied by an unrecognized process (PID $processId); it was not stopped."
        }

        $runtimeInfo = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/runtime-info" -TimeoutSec 3
        if (-not $runtimeInfo.pythonExecutable -or
            [System.IO.Path]::GetFullPath($runtimeInfo.pythonExecutable) -ne [System.IO.Path]::GetFullPath($process.ExecutablePath)) {
            throw "The process on port $backendPort could not be verified as this project's backend; it was not stopped."
        }

        Write-Host "Restarting the existing Audio backend (PID $processId) so its logs appear below..."
        Stop-Process -Id $processId -ErrorAction Stop
    }

    for ($attempt = 0; $attempt -lt 15 -and (Get-ListeningProcessIds -Port $backendPort).Count -gt 0; $attempt++) {
        Start-Sleep -Seconds 1
    }
    if ((Get-ListeningProcessIds -Port $backendPort).Count -gt 0) {
        throw "The existing backend did not release port $backendPort after stopping."
    }
}

    $backendJob = Start-Job -Name 'AudioBackend' -ArgumentList $backendPath, $pythonExecutable -ScriptBlock {
        param($Path, $Python)
        Set-Location -LiteralPath $Path
        $env:PYTHONUNBUFFERED = '1'
        & $Python -m app.main
        if ($LASTEXITCODE -ne 0) {
            throw "Backend exited with code $LASTEXITCODE."
        }
    }
    $serverJobs += $backendJob
    Write-Host 'Backend started in this PowerShell window.'

    $backendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $jobOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        foreach ($line in $jobOutput) {
            Write-Host $line
        }
        if ($backendJob.State -ne 'Running') {
            throw "Backend stopped before becoming ready. Check the output above for errors."
        }
        try {
            $response = Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                $backendReady = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $backendReady) {
        throw "Backend did not become ready at http://127.0.0.1:$backendPort. Check the output above for errors."
    }

$frontendListeners = Get-ListeningProcessIds -Port $frontendPort
if ($frontendListeners.Count -gt 0) {
    Test-Endpoint -Url $frontendUrl -Name 'Frontend'
    Write-Host "Frontend is already running at $frontendUrl."
} else {
    $frontendJob = Start-Job -Name 'AudioFrontend' -ArgumentList $frontendPath -ScriptBlock {
        param($Path)
        Set-Location -LiteralPath $Path
        npm run dev
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend exited with code $LASTEXITCODE."
        }
    }
    $serverJobs += $frontendJob
    Write-Host 'Frontend started in this PowerShell window.'

    $frontendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $jobOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        foreach ($line in $jobOutput) {
            Write-Host $line
        }
        if ($frontendJob.State -ne 'Running') {
            throw "Frontend stopped before becoming ready. Check the output above for errors."
        }
        try {
            $response = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                $frontendReady = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $frontendReady) {
        throw "Frontend did not become ready at $frontendUrl. Check the frontend PowerShell window for errors."
    }
}

Write-Host ''
Write-Host "Audio Story Reader is ready: $frontendUrl"
if ($serverJobs.Count -gt 0) {
    Write-Host 'Both servers are running in this window. Press Ctrl+C to stop them.'
    while (@($serverJobs | Where-Object { $_.State -eq 'Running' }).Count -gt 0) {
        foreach ($job in $serverJobs) {
            $jobOutput = Receive-Job -Job $job -ErrorAction SilentlyContinue
            foreach ($line in $jobOutput) {
                Write-Host $line
            }
        }

        $stoppedJob = $serverJobs | Where-Object { $_.State -ne 'Running' } | Select-Object -First 1
        if ($stoppedJob) {
            $jobOutput = Receive-Job -Job $stoppedJob -ErrorAction SilentlyContinue
            foreach ($line in $jobOutput) {
                Write-Host $line
            }
            throw "$($stoppedJob.Name) stopped unexpectedly."
        }
        Start-Sleep -Seconds 1
    }
}
} finally {
    if ($serverJobs.Count -gt 0) {
        Stop-Job -Job $serverJobs -ErrorAction SilentlyContinue
        Remove-Job -Job $serverJobs -Force -ErrorAction SilentlyContinue
    }
}
