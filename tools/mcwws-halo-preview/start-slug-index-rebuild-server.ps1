# 后台启动 slug 索引重建服务（localhost 开发）
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Py = Join-Path $Root "slug-index-rebuild-server.py"
Start-Process -FilePath "python" -ArgumentList @($Py) -WindowStyle Hidden
Write-Host "已启动 slug-index-rebuild-server -> http://127.0.0.1:8765/rebuild" -ForegroundColor Green
