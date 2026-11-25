$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$ArchiveName = "pulse-pos-deploy.tar.gz"
$ArchivePath = Join-Path $ProjectRoot $ArchiveName

Write-Host "Packing project into $ArchiveName ..." -ForegroundColor Cyan

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
    "--exclude=omni-pos-core-deploy.tar.gz",
    "--exclude=omni-pos-core-deploy-clean.tar.gz",
    "--exclude=pulse-pos-deploy.tar.gz",
    "--exclude=wrikmart-deploy-clean.tar.gz",
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
Write-Host "Archive ready: $ArchiveName ($([math]::Round($size,1)) MB)" -ForegroundColor Green

# Also update omni-pos-core-deploy.tar.gz for compatibility
Copy-Item $ArchivePath (Join-Path $ProjectRoot "omni-pos-core-deploy.tar.gz") -Force
Write-Host "Synchronized omni-pos-core-deploy.tar.gz" -ForegroundColor Green
