$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$ArchiveName = "inovasi-pos-deploy.tar.gz"
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
    "--exclude=_ref-saas-portable",
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
Write-Host "Archive ready: $ArchivePath ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
