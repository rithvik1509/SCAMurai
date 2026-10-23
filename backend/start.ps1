param([ValidateRange(1024,65535)][int]$Port = 8001, [switch]$Reload)
$ErrorActionPreference = 'Stop'
$backendPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $backendPython)) { throw 'Run backend\setup.ps1 first.' }
$projectDirectory = Split-Path -Parent $PSScriptRoot
$serverArguments = @('-m', 'uvicorn', 'backend.main:app', '--app-dir', $projectDirectory, '--host', '127.0.0.1', '--port', "$Port", '--no-access-log')
if ($Reload) { $serverArguments += @('--reload', '--reload-dir', $PSScriptRoot) }
& $backendPython @serverArguments
exit $LASTEXITCODE
