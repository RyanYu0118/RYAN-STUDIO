# 从 Git wiki 源文件一键编译并推送到 Halo（需 wiki/.halo.env 中的 HALO_PAT）
param(
    [Parameter(Mandatory = $true)]
    [string]$File,
    [switch]$Publish,
    [switch]$RewriteUpload,
    [switch]$DryRun
)
$WikiRoot = $PSScriptRoot
$Repo = Split-Path -Parent $WikiRoot
$InputPath = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $WikiRoot $File }
if (-not (Test-Path -LiteralPath $InputPath)) {
    Write-Error "找不到: $InputPath"
}
$py = Join-Path $Repo "tools\mcwws-halo-preview\push-to-halo.py"
$pyArgs = @($py, $InputPath)
if ($Publish) { $pyArgs += "--publish" }
if ($RewriteUpload) { $pyArgs += "--rewrite-upload" }
if ($DryRun) { $pyArgs += "--dry-run" }
& python @pyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
