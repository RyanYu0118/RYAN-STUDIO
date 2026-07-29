# 从 Git 源 .md 生成 Halo 文章 JSON（与 demo/流浪世界服务器Wiki.json 同结构，可整文件导入）
param(
    [string]$File = "home.md",
    [switch]$RewriteUpload,
    [switch]$Publish
)
$WikiRoot = $PSScriptRoot
$Repo = Split-Path -Parent $WikiRoot
$InputPath = Join-Path $WikiRoot $File
if (-not (Test-Path -LiteralPath $InputPath)) {
    Write-Error "Missing: $InputPath"
}
$export = Join-Path $Repo "tools\mcwws-halo-preview\export-post-json.ps1"
$outName = [System.IO.Path]::GetFileNameWithoutExtension($File) + ".halo-import.json"
$OutputPath = Join-Path (Join-Path $WikiRoot "demo") $outName
$exportArgs = @{
    InputPath  = $InputPath
    OutputPath = $OutputPath
}
if ($RewriteUpload) { $exportArgs.RewriteUpload = $true }
if ($Publish) { $exportArgs.Publish = $true }
& $export @exportArgs
Write-Host ""
Write-Host "Import in Halo: use demo/$outName (draft unless -Publish)."
Write-Host "Edit source: wiki/$File then re-run this script."
