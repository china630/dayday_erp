# Останавливает только Next.js dev для репозитория dayday_erp (не трогает Nest и другие Node-проекты).
$killed = @()
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $c = $_.CommandLine
  if (-not $c) { return $false }
  if ($c -notlike '*dayday_erp*') { return $false }
  return ($c -match 'next[/\\]dist[/\\]bin[/\\]next') -or ($c -match 'node_modules[/\\]next[/\\]dist')
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  $killed += $_.ProcessId
}
if ($killed.Count) {
  Write-Host "Stopped Next.js (dayday_erp), PIDs: $($killed -join ', ')"
} else {
  Write-Host "No Next.js dev process found for dayday_erp."
}
