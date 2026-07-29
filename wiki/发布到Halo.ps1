# 从 Git 源 .md 展开 {{MCWWS_*}}，生成 wiki/_publish/*.halo-paste.md（粘贴到 Halo 后台用）
param(
    [string]$File = "home.md",
    [switch]$RewriteUpload
)
$WikiRoot = $PSScriptRoot
$Repo = Split-Path -Parent $WikiRoot
$InputPath = Join-Path $WikiRoot $File
if (-not (Test-Path -LiteralPath $InputPath)) {
    Write-Error "找不到: $InputPath"
}
$expand = Join-Path $Repo "tools\mcwws-halo-preview\publish-expand.ps1"
$expandArgs = @{ InputPath = $InputPath }
if ($RewriteUpload) { $expandArgs.RewriteUpload = $true }
& $expand @expandArgs
Write-Host ""
Write-Host "Git source: $InputPath"
Write-Host "Paste blocks from wiki/_publish into Halo (keep UUID lines if editor requires)."
