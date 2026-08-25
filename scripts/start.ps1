# Build and start the app. Windows.
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".env")) {
    Write-Error "Missing .env in the project root. It must contain OPENROUTER_API_KEY."
}

# Without this the container signs session cookies with the fallback key in
# backend/app/main.py, which is published in the source, so anyone who has read the
# repository could forge a session. Written once and kept, so restarting does not
# sign everybody out. compose passes it through env_file.
$envText = Get-Content ".env" -Raw
if ($envText -notmatch "(?m)^SECRET_KEY=") {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $key = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
    $envText = $envText.TrimEnd() + "`nSECRET_KEY=$key`n"
    Set-Content -Path ".env" -Value $envText -NoNewline -Encoding ascii
    Write-Output "Generated a SECRET_KEY in .env"
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "App running at http://localhost:8000"
