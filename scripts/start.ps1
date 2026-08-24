# Build and start the app. Windows.
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".env")) {
    Write-Error "Missing .env in the project root. It must contain OPENROUTER_API_KEY."
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "App running at http://localhost:8000"
