param(
    [string]$File = "home.md"
)
$WikiRoot = $PSScriptRoot
$Repo = Split-Path -Parent $WikiRoot
$InputPath = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $WikiRoot $File }
if (-not (Test-Path -LiteralPath $InputPath)) {
    Write-Error "找不到: $InputPath"
}
& (Join-Path $Repo "tools\mcwws-halo-preview\compile.ps1") -InputPath $InputPath
