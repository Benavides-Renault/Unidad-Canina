$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot '.local\share-runtime.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No hay un enlace compartido registrado.'; exit 0 }
$shareState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$tunnelProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$shareState.tunnelPid)"
if ($tunnelProcess) {
  $expectedPath = Join-Path $projectRoot '.local\tools\cloudflared.exe'
  if ($tunnelProcess.ExecutablePath -ne $expectedPath) { throw 'El identificador pertenece a otro proceso. No se detuvo.' }
  Stop-Process -Id $tunnelProcess.ProcessId
}
$gatewayProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$shareState.pid)"
if ($gatewayProcess) {
  if ($gatewayProcess.CommandLine -notlike '*scripts/share-start.mjs*') { throw 'El identificador pertenece a otro proceso. No se detuvo.' }
  Stop-Process -Id $gatewayProcess.ProcessId
}
$shareState | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$shareState | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
Write-Output 'Enlace detenido. ORYX K9 local sigue funcionando.'
