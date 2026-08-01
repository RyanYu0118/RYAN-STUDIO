# 一次性：将 RS_WikiLink-v* 旧 tag 迁移为 patch 三位补零（修复 GitHub Release 侧边栏字母序）
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path "$Root\..\.."
$FormatScript = Join-Path $Root "format-release-tag.ps1"

function Get-PaddedTag([string]$OldTag) {
  if ($OldTag -notmatch '^RS_WikiLink-v(\d+)\.(\d+)\.(\d+)$') { return $null }
  $ver = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
  & $FormatScript -Version $ver
}

$DryRun = $false
if ($args -contains '-WhatIf') { $DryRun = $true }

$tags = git -C $RepoRoot tag -l 'RS_WikiLink-v*' --sort=v:refname
$plan = @()
foreach ($old in $tags) {
  $new = Get-PaddedTag $old
  if (-not $new -or $new -eq $old) { continue }
  $commit = git -C $RepoRoot rev-parse "$old^{commit}"
  $plan += [pscustomobject]@{ Old = $old; New = $new; Commit = $commit }
}

if ($plan.Count -eq 0) {
  Write-Host "No tags need migration." -ForegroundColor Green
  exit 0
}

Write-Host "Will migrate $($plan.Count) tag(s):" -ForegroundColor Cyan
$plan | ForEach-Object { Write-Host "  $($_.Old) -> $($_.New)" }

if ($DryRun) {
  Write-Host "WhatIf: no changes made." -ForegroundColor Yellow
  exit 0
}

foreach ($item in $plan) {
  git -C $RepoRoot tag -a $item.New $item.Commit -m "RS_WikiLink $($item.New)"
  git -C $RepoRoot push origin $item.New
  git -C $RepoRoot push origin ":refs/tags/$($item.Old)"
  Write-Host "OK $($item.Old) -> $($item.New)" -ForegroundColor Green
}

Write-Host "Done. Old GitHub Releases may remain orphaned — delete duplicates in Releases UI if needed." -ForegroundColor Yellow
Write-Host "If owner view shows Drafts tab entries, run: .\scripts\publish-release-drafts.ps1 (requires gh auth login)" -ForegroundColor Yellow
Write-Host "New tag pushes may re-run CI once per migrated tag." -ForegroundColor Yellow
