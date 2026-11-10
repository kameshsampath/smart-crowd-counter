#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# 1. Load .env (creating from .env.example if needed)
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[dev] Created .env from .env.example" -ForegroundColor Cyan
}
Get-Content ".env" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line -split "=", 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()
        if (-not [Environment]::GetEnvironmentVariable($key, "Process")) {
            [Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

$AppUser       = if ($env:S3_APP_USER)       { $env:S3_APP_USER }       else { "crowd-counter" }
$AppSecret     = if ($env:S3_APP_SECRET)     { $env:S3_APP_SECRET }     else { "crowd-counter-dev-secret" }
$RootUser      = if ($env:MINIO_ROOT_USER)   { $env:MINIO_ROOT_USER }   elseif ($env:S3_ACCESS_KEY -and $env:S3_ACCESS_KEY -ne $AppUser) { $env:S3_ACCESS_KEY } else { "minioadmin" }
$RootPassword  = if ($env:MINIO_ROOT_PASSWORD) { $env:MINIO_ROOT_PASSWORD } elseif ($env:S3_SECRET_KEY -and $env:S3_SECRET_KEY -ne $AppSecret) { $env:S3_SECRET_KEY } else { "minioadmin" }
$PhotosBucket  = if ($env:S3_PHOTOS_BUCKET)  { $env:S3_PHOTOS_BUCKET }  else { "snaps" }
$ResultsBucket = if ($env:S3_RESULTS_BUCKET) { $env:S3_RESULTS_BUCKET } else { "analysis" }
$AgentModel    = if ($env:AGENT_MODEL)       { $env:AGENT_MODEL }       else { "qwen2.5vl:7b" }
$OllamaUrl     = if ($env:OLLAMA_BASE_URL)   { $env:OLLAMA_BASE_URL }   else { "http://localhost:11434" }

if (-not (Test-Path "minio.license")) {
    Write-Error "Missing minio.license in $RepoRoot. Download a free single-node license at https://min.io/pricing and save it as minio.license."
}

# 2. Ensure minio.exe and mc.exe are available
$BinDir = Join-Path $RepoRoot ".bin"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$MinioExe = if (Test-Path ".\minio.exe") { (Resolve-Path ".\minio.exe").Path } else { Join-Path $BinDir "minio.exe" }
if (-not (Test-Path $MinioExe)) {
    Write-Host "[dev] Downloading MinIO AIStor (minio.exe)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://dl.min.io/aistor/minio/release/windows-amd64/minio.exe" -OutFile $MinioExe
}

$McExe = if (Test-Path ".\mc.exe") { (Resolve-Path ".\mc.exe").Path } else { Join-Path $BinDir "mc.exe" }
if (-not (Test-Path $McExe)) {
    Write-Host "[dev] Downloading MinIO Client (mc.exe)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://dl.min.io/aistor/mc/release/windows-amd64/mc.exe" -OutFile $McExe
}

$MinioProc = $null
$AgentProc = $null

try {
    # 3. Start MinIO AIStor
    $env:MINIO_ROOT_USER = $RootUser
    $env:MINIO_ROOT_PASSWORD = $RootPassword
    $DataDir = Join-Path $RepoRoot ".minio-data"
    Write-Host "[dev] Starting MinIO AIStor on :9000 (console :9001)..." -ForegroundColor Cyan
    $MinioProc = Start-Process -FilePath $MinioExe -ArgumentList @("server", $DataDir, "--license", ".\minio.license", "--console-address", ":9001") -PassThru -NoNewWindow

    # 4. Wait for AIStor and provision buckets + scoped service user
    $ErrorActionPreference = "Continue"
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        & $McExe alias set local http://localhost:9000 $RootUser $RootPassword > $null 2>&1
        if ($LASTEXITCODE -eq 0) {
            & $McExe ready local > $null 2>&1
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw "AIStor did not become ready within 30 seconds." }

    & $McExe mb --ignore-existing "local/$PhotosBucket" "local/$ResultsBucket" > $null 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Failed to create buckets in AIStor." }

    $PolicyPath = Join-Path $env:TEMP "crowd-counter-policy.json"
    @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": [
        "arn:aws:s3:::$PhotosBucket",
        "arn:aws:s3:::$PhotosBucket/*",
        "arn:aws:s3:::$ResultsBucket",
        "arn:aws:s3:::$ResultsBucket/*"
      ]
    }
  ]
}
"@ | Set-Content -Path $PolicyPath -Encoding ascii

    & $McExe admin policy create local crowd-counter $PolicyPath > $null 2>&1
    & $McExe admin user add local $AppUser $AppSecret > $null 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Failed to create service user $AppUser in AIStor." }
    & $McExe admin policy attach local crowd-counter --user $AppUser > $null 2>&1
    Write-Host "[dev] Buckets ($PhotosBucket, $ResultsBucket) and service user ($AppUser) ready." -ForegroundColor Green

    # 5. Low-RAM Ollama defaults & scoped S3 credentials for both agent and web app
    if (-not $env:OLLAMA_MAX_LOADED_MODELS) { $env:OLLAMA_MAX_LOADED_MODELS = "1" }
    if (-not $env:OLLAMA_KEEP_ALIVE)        { $env:OLLAMA_KEEP_ALIVE = "2m" }
    $env:OLLAMA_BASE_URL = $OllamaUrl
    $env:OLLAMA_API_BASE = $OllamaUrl
    $env:AGENT_MODEL = $AgentModel
    $env:S3_ACCESS_KEY = $AppUser
    $env:S3_SECRET_KEY = $AppSecret

    # 6. Sync and start the Google ADK agent
    $AgentDir = Join-Path $RepoRoot "agent"
    Write-Host "[dev] Syncing and starting Google ADK agent ($AgentModel) on :8000..." -ForegroundColor Cyan
    Push-Location $AgentDir
    try {
        uv sync
        if ($LASTEXITCODE -ne 0) { throw "uv sync failed." }
    } finally {
        Pop-Location
    }
    $AgentProc = Start-Process -FilePath "uv" -ArgumentList @("run", "smart-crowd-counter-agent") -WorkingDirectory $AgentDir -PassThru -NoNewWindow

    # 7. Start Next.js web app
    if (-not (Test-Path "node_modules")) {
        Write-Host "[dev] Installing npm dependencies..." -ForegroundColor Cyan
        npm.cmd ci
    }
    Write-Host "[dev] Starting Next.js on http://localhost:3000 (Ctrl+C to stop all services)..." -ForegroundColor Green
    npm.cmd run dev
} finally {
    $env:S3_ACCESS_KEY = $RootUser
    $env:S3_SECRET_KEY = $RootPassword
    Write-Host "`n[dev] Stopping background services..." -ForegroundColor Yellow
    if ($AgentProc -and -not $AgentProc.HasExited) { Stop-Process -Id $AgentProc.Id -Force -ErrorAction SilentlyContinue }
    if ($MinioProc -and -not $MinioProc.HasExited) { Stop-Process -Id $MinioProc.Id -Force -ErrorAction SilentlyContinue }
}
