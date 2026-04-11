# Останавливает только Nest API для репозитория dayday_erp (не трогает Next.js).
$killed = @()
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $c = $_.CommandLine
  if (-not $c) { return $false }
  if ($c -notlike '*dayday_erp*') { return $false }
  return ($c -match '@nestjs[/\\]cli') -or ($c -match 'nest\.js') -or ($c -match 'apps[/\\]api[/\\]dist[/\\]main')
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  $killed += $_.ProcessId
}
if ($killed.Count) {
  Write-Host "Stopped Nest API (dayday_erp), PIDs: $($killed -join ', ')"
} else {
  Write-Host "No Nest API process found for dayday_erp."
}
