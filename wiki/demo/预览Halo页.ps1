# 将同目录下的 Halo 导出 .md 编译为 _preview/*.html
param(
    [string]$File = "流浪世界服务器Wiki.md"
)
$Here = $PSScriptRoot
$Repo = Split-Path -Parent (Split-Path -Parent $Here)
& (Join-Path $Repo "tools\mcwws-halo-preview\compile.ps1") -InputPath (Join-Path $Here $File)
