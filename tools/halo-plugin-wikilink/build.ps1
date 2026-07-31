# RS Wiki Link — 构建并输出 JAR
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "==> Gradle build (skip tests)..." -ForegroundColor Cyan
& "$Root\gradlew.bat" build -x test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$jar = Get-ChildItem -Path "$Root\build\libs" -Filter "plugin-RS_WikiLink-*.jar" |
  Where-Object { $_.Name -notmatch 'plain' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($jar) {
  Write-Host "==> OK: $($jar.FullName)" -ForegroundColor Green
} else {
  Write-Host "==> 未找到 JAR，请检查 build/libs/" -ForegroundColor Red
  exit 1
}
