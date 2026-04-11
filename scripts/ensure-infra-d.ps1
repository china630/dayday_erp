# Creates infra dirs on D: (Docker volumes, npm cache, tmp, storage).
$base = "D:\DockerData\dayday_erp"
$dirs = @("postgres", "redis", "storage", "npm-cache", "tmp")
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $base $d) | Out-Null
}
Write-Host "OK: $base ($($dirs -join ', '))"
