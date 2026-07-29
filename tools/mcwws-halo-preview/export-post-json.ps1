param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [string]$OutputPath = "",
    [switch]$RewriteUpload,
    [switch]$Publish
)

$ErrorActionPreference = "Stop"
$Script = Join-Path $PSScriptRoot "export-post-json.py"
$InFull = (Resolve-Path -LiteralPath $InputPath).Path

$pyArgs = @($Script, $InFull)
if ($OutputPath -ne "") { $pyArgs += @("-o", $OutputPath) }
if ($RewriteUpload) { $pyArgs += "--rewrite-upload" }
if ($Publish) { $pyArgs += "--publish" }

& python @pyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
