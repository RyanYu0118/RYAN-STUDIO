param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [string]$OutputPath = "",
    [switch]$RewriteUpload
)

$ErrorActionPreference = "Stop"
$Script = Join-Path $PSScriptRoot "publish-expand.py"
$InFull = (Resolve-Path -LiteralPath $InputPath).Path

$pyArgs = @($Script, $InFull)
if ($OutputPath -ne "") {
    $pyArgs += @("-o", $OutputPath)
}
if ($RewriteUpload) {
    $pyArgs += "--rewrite-upload"
}

& python @pyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
