# 打 RS_WikiLink Release（本地辅助）
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$version = (Get-Content "$Root\gradle.properties" | Where-Object { $_ -match '^version=' }) -replace '^version=', ''
$tag = & "$Root\scripts\format-release-tag.ps1" -Version $version

Write-Host "==> Build..." -ForegroundColor Cyan
& "$Root\build.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Tag: $tag" -ForegroundColor Cyan
git -C (Resolve-Path "$Root\..\..") tag -a $tag -m "RS_WikiLink $tag" -f 2>$null
if ($LASTEXITCODE -ne 0) {
  git -C (Resolve-Path "$Root\..\..") tag -a $tag -m "RS_WikiLink $tag"
}

Write-Host "==> Push tag (triggers GitHub Actions release)..." -ForegroundColor Cyan
git -C (Resolve-Path "$Root\..\..") push origin $tag --force

Write-Host "==> Done. Check: https://github.com/RyanYu0118/RYAN-STUDIO/releases/tag/$tag" -ForegroundColor Green
