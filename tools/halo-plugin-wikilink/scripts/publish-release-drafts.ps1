# 将仓库内所有 RS_WikiLink Draft Release 正式发布（需 gh auth login）
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "需要 GitHub CLI：winget install GitHub.cli 后运行 gh auth login"
}

$releases = gh release list --repo RyanYu0118/RYAN-STUDIO --limit 100 --json tagName,isDraft,prerelease | ConvertFrom-Json
$drafts = @($releases | Where-Object { $_.isDraft -and $_.tagName -like 'RS_WikiLink-v*' })

if ($drafts.Count -eq 0) {
  Write-Host "没有 RS_WikiLink 草稿 Release；公开 API 侧应已全部发布。" -ForegroundColor Green
  gh release list --repo RyanYu0118/RYAN-STUDIO --limit 15
  exit 0
}

Write-Host "发现 $($drafts.Count) 个草稿，正在发布…" -ForegroundColor Cyan
foreach ($d in $drafts) {
  gh release edit $d.tagName --repo RyanYu0118/RYAN-STUDIO --draft=false --prerelease=false
  Write-Host "  published: $($d.tagName)" -ForegroundColor Green
}

Write-Host "完成：https://github.com/RyanYu0118/RYAN-STUDIO/releases" -ForegroundColor Green
