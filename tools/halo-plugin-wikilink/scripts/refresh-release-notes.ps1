# 重新生成并更新指定 tag 的 GitHub Release 正文（需 gh auth login）
param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path "$Root\..\.."

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "需要 GitHub CLI：gh auth login"
}

$bodyFile = Join-Path $env:TEMP "rs-wikilink-release-body.md"
& bash "$Root/gen-release-notes.sh" $Tag $bodyFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

gh release edit $Tag --repo RyanYu0118/RYAN-STUDIO --notes-file $bodyFile
Write-Host "Updated release notes: $Tag" -ForegroundColor Green
Get-Content $bodyFile
