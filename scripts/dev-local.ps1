# SocialFlux local dev starter (Windows).
# Loads D:\metaflux\.env into process env, then launches api / worker / web
# as detached processes (bypasses turbo so env is preserved).
$ErrorActionPreference = "Stop"
$Root = "D:\metaflux"
$EnvFile = Join-Path $Root ".env"

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $k = $line.Substring(0, $idx).Trim()
  $v = $line.Substring($idx + 1).Trim()
  [Environment]::SetEnvironmentVariable($k, $v, "Process")
}

$Pnpm = "C:\Users\Clavis\AppData\Roaming\npm\pnpm.cmd"
$jobs = @(
  @{ Filter = "@socialflux/api";    Out = "api.out.log";    Err = "api.err.log" },
  @{ Filter = "@socialflux/worker"; Out = "worker.out.log"; Err = "worker.err.log" },
  @{ Filter = "@socialflux/web";    Out = "web.out.log";    Err = "web.err.log" }
)

foreach ($j in $jobs) {
  $outPath = Join-Path $Root $j.Out
  $errPath = Join-Path $Root $j.Err
  Remove-Item $outPath -ErrorAction SilentlyContinue
  Remove-Item $errPath -ErrorAction SilentlyContinue
  Start-Process -FilePath $Pnpm `
    -ArgumentList "--filter", $j.Filter, "dev" `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath | Out-Null
}

"LAUNCHED api+worker+web with DATABASE_URL_len=$([Environment]::GetEnvironmentVariable('DATABASE_URL','Process').Length)"
