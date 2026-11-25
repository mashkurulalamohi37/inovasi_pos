# -----------------------------------------------------------------------------
# omni-pos-core  ->  ideaapi server deploy script
# Server : ideaapi@118.179.223.42
# Dir    : /home/ideaapi/pulse-pos
# -----------------------------------------------------------------------------
# Usage (normal deploy):
#   .\deploy-to-server.ps1
#
# First-time HTTPS setup (enables live camera barcode scanner):
#   .\deploy-to-server.ps1 -Https
#
# Skip re-packing if archive already exists:
#   .\deploy-to-server.ps1 -SkipPack
#   .\deploy-to-server.ps1 -Https -SkipPack
# -----------------------------------------------------------------------------

param(
    [switch]$SkipPack,
    [switch]$Https      # Adds nginx HTTPS proxy + generates self-signed cert
)

$ErrorActionPreference = "Stop"

# -- Config --------------------------------------------------------------------
$ProjectRoot  = $PSScriptRoot
$ArchiveName  = "pulse-pos-deploy.tar.gz"
$ArchivePath  = Join-Path $ProjectRoot $ArchiveName
$ServerUser   = "ideaapi"
$ServerHost   = "118.179.223.42"
$ServerDir    = "/home/ideaapi/pulse-pos"
$ComposeFile  = if ($Https) { "docker-compose.https.yml" } else { "docker-compose.server.yml" }

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host "  Pulse POS -- Deploy to Server" -ForegroundColor Cyan
if ($Https) {
    Write-Host "  Mode: HTTPS (nginx + self-signed cert)" -ForegroundColor Yellow
    Write-Host "  -> Live camera scanner will work on phones!" -ForegroundColor Green
} else {
    Write-Host "  Mode: Standard HTTP" -ForegroundColor Gray
}
Write-Host "  Server: $ServerUser@$ServerHost" -ForegroundColor Gray
Write-Host "  Dir:    $ServerDir" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host ""

# -- Step 1: Pack --------------------------------------------------------------
if ($SkipPack -and (Test-Path $ArchivePath)) {
    Write-Host "[SKIP]  Skipping pack -- using existing $ArchiveName" -ForegroundColor Cyan
} else {
    Write-Host "[PACK]  Packing project..." -ForegroundColor Cyan

    $excludes = @(
        "--exclude=node_modules",
        "--exclude=backend/venv",
        "--exclude=backend/__pycache__",
        "--exclude=.git",
        "--exclude=.env",
        "--exclude=.env.*",
        "--exclude=backend/.env",
        "--exclude=dist",
        "--exclude=.output",
        "--exclude=.tanstack",
        "--exclude=backups",
        "--exclude=nginx/certs",
        "--exclude=nginx/logs",
        "--exclude=test-results",
        "--exclude=playwright-report",
        "--exclude=uploads",
        "--exclude=backend/uploads",
        "--exclude=*.tar.gz",
        "--exclude=*.tgz",
        "--exclude=*.zip",
        "--exclude=*.db",
        "--exclude=*.db.*",
        "--exclude=*.sqlite*",
        "--exclude=store documents",
        "--exclude=scratch",
        "--exclude=*.log",
        "--exclude=*.wav",
        "--exclude=*.mp4",
        "--exclude=*.ogg",
        "--exclude=*.pdf",
        "--exclude=*.docx"
    )

    $tarArgs = $excludes + @("-czf", $ArchiveName, "-C", $ProjectRoot, ".")
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar failed" }

    $size = (Get-Item $ArchivePath).Length / 1MB
    Write-Host "[OK]    Archive ready: $ArchiveName ($([math]::Round($size,1)) MB)" -ForegroundColor Green
}

# -- Step 2: SCP upload --------------------------------------------------------
$target = "${ServerUser}@${ServerHost}"
Write-Host ""
Write-Host "[UPLOAD] Uploading to ${target}:${ServerDir}/ ..." -ForegroundColor Cyan

scp -C -o ServerAliveInterval=15 -o ServerAliveCountMax=10 -o StrictHostKeyChecking=no `
    "$ArchivePath" "${target}:${ServerDir}/${ArchiveName}"
if ($LASTEXITCODE -ne 0) { throw "scp upload failed" }

Write-Host "[OK]    Upload complete" -ForegroundColor Green

# -- Step 3: Remote deploy -----------------------------------------------------
Write-Host ""
Write-Host "[DEPLOY] Deploying on server..." -ForegroundColor Cyan

if ($Https) {
    # HTTPS mode: run setup-https.sh which generates cert + starts nginx
    $remoteCmd = @"
cd $ServerDir &&
tar -xzf $ArchiveName --overwrite --exclude=.env &&
chmod +x setup-https.sh &&
./setup-https.sh
"@
} else {
    # Standard mode: extract + docker compose up
    $remoteCmd = @"
cd $ServerDir &&
tar -xzf $ArchiveName --overwrite --exclude=.env &&
docker compose -f $ComposeFile up -d --build &&
docker compose -f $ComposeFile ps
"@
}

ssh -o StrictHostKeyChecking=no $target $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed" }

# -- Done ----------------------------------------------------------------------
Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkCyan
Write-Host "[OK]  Deploy complete!" -ForegroundColor Green
Write-Host ""
if ($Https) {
    Write-Host "  Frontend  -> https://${ServerHost}" -ForegroundColor Yellow
    Write-Host "  Backend   -> https://${ServerHost}/api/v1" -ForegroundColor Yellow
    Write-Host "  API Docs  -> https://${ServerHost}/docs" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  FIRST TIME on phone: tap 'Advanced -> Proceed'" -ForegroundColor Cyan
    Write-Host "  (browser warning is normal for self-signed cert)" -ForegroundColor Cyan
} else {
    Write-Host "  Frontend  -> http://${ServerHost}:3008" -ForegroundColor Yellow
    Write-Host "  Backend   -> http://${ServerHost}:9100/api/v1" -ForegroundColor Yellow
    Write-Host "  API Docs  -> http://${ServerHost}:9100/docs" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Logs: ssh $target 'cd $ServerDir && docker compose -f $ComposeFile logs -f'" -ForegroundColor DarkGray
Write-Host "======================================================" -ForegroundColor DarkCyan
