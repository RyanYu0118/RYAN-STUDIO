param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$Compile = Join-Path $PSScriptRoot "compile.py"
$InFull = (Resolve-Path -LiteralPath $InputPath).Path

$pyArgs = @($Compile, $InFull)
if ($OutputPath -ne "") {
    $pyArgs += @("-o", $OutputPath)
}

& python @pyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$demoDir = Split-Path -Parent $InFull
$base = [System.IO.Path]::GetFileNameWithoutExtension($InFull)
$HtmlPath = Join-Path (Join-Path $demoDir "_preview") ($base + ".html")
Write-Host ""
Write-Host "Generated: $HtmlPath"
Write-Host "Cursor: Ctrl+Shift+P -> Simple Browser: Show"
Write-Host "  file:///$($HtmlPath -replace '\\','/')"
