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
$shellExecutable = (Get-Process -Id $PID).Path

$backendListeners = Get-ListeningProcessIds -Port $backendPort
if ($backendListeners.Count -gt 0) {
    Test-Endpoint -Url $backendUrl -Name 'Backend'
    Write-Host "Backend is already running at http://127.0.0.1:$backendPort."
} else {
    $backendCommand = 'Set-Location -LiteralPath {0}; & {1} -m app.main' -f `
        (ConvertTo-PowerShellLiteral $backendPath), `
        (ConvertTo-PowerShellLiteral $pythonExecutable)
    Start-Process -FilePath $shellExecutable `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand) `
        -WorkingDirectory $backendPath
    Write-Host 'Backend started in a new PowerShell window.'

    $backendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
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
        throw "Backend did not become ready at http://127.0.0.1:$backendPort. Check the backend PowerShell window for errors."
    }
}

$frontendListeners = Get-ListeningProcessIds -Port $frontendPort
if ($frontendListeners.Count -gt 0) {
    Test-Endpoint -Url $frontendUrl -Name 'Frontend'
    Write-Host "Frontend is already running at $frontendUrl."
} else {
    $frontendCommand = 'Set-Location -LiteralPath {0}; npm run dev' -f `
        (ConvertTo-PowerShellLiteral $frontendPath)
    Start-Process -FilePath $shellExecutable `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand) `
        -WorkingDirectory $frontendPath
    Write-Host 'Frontend started in a new PowerShell window.'

    $frontendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
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
Write-Host 'Keep both server windows open while using the app.'
