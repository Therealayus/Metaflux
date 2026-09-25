# Start ngrok tunnels for SocialFlux (Windows, detached).
$ErrorActionPreference = "Stop"
$Root = "D:\metaflux"
$Ngrok = "C:\Users\Clavis\AppData\Local\Microsoft\WindowsApps\ngrok.exe"

$MainCfg = "C:\Users\Clavis\AppData\Local\ngrok\ngrok.yml"
$MetaCfg = Join-Path $Root "ngrok.socialflux.yml"
$Log = Join-Path $Root "ngrok.log"
Remove-Item $Log -ErrorAction SilentlyContinue
Start-Process -FilePath $Ngrok -ArgumentList @(
  "start", "--all",
  "--config", $MainCfg,
  "--config", $MetaCfg,
  "--log", $Log,
  "--log-format", "json"
) -WorkingDirectory $Root | Out-Null

"NGROK AGENT LAUNCHED (api+web)"
