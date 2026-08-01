# 将 semver 转为 GitHub Release 用 tag（patch 三位补零，避免侧边栏字母序错乱）
param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
  throw "Invalid semver: $Version (expected MAJOR.MINOR.PATCH)"
}

$major = [int]$Matches[1]
$minor = [int]$Matches[2]
$patch = [int]$Matches[3]
"RS_WikiLink-v$major.$minor.$('{0:D3}' -f $patch)"
