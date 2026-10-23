$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }
    }
    & '.venv\Scripts\python.exe' -m pip install -r requirements.lock
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & '.venv\Scripts\python.exe' -m playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
    if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
    Write-Host 'Backend ready. Run .\backend\start.ps1 from the project folder.'
} finally {
    Pop-Location
}
