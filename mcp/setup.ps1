# setup.ps1 — put the gsTeam scoreboard into someone's Claude Desktop.
#
# For Bobby, Kurt and Mike, who should not have to read a README to try this.
# It installs the dependencies, writes the Claude Desktop config, and then proves
# the connection by asking the server which scoreboard it reached.
#
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -ServiceKey "<key>" -Email you@groundstandard.com
#
# Existing MCP servers in the config are left alone; only the "gsteam" entry is
# written, and the file is backed up first.

param(
  [Parameter(Mandatory = $true)][string]$Email,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$SupabaseUrl = 'https://obfekzpumitnybxfgnol.supabase.co',
  # The public key the website already ships. Not a secret, and not enough on its
  # own — it only says which project; the password says who you are.
  [string]$AnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmVrenB1bWl0bnlieGZnbm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTQxMDEsImV4cCI6MjEwNDk5MDEwMX0.Oqh3S4XYojDTbU6hyiLBBIqZAJCixsKQfc1h5KFuI44',
  [switch]$ReadOnly,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($text) { Write-Host "`n$text" -ForegroundColor Cyan }
function Good($text) { Write-Host "  ok   $text" -ForegroundColor Green }
function Bad($text)  { Write-Host "  FAIL $text" -ForegroundColor Red }

Step 'Checking node'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Bad 'node is not installed. Get it from https://nodejs.org (the LTS build), then run this again.'
  exit 1
}
$nodeVersion = (& node --version)
$major = [int]($nodeVersion -replace '^v(\d+)\..*$', '$1')
if ($major -lt 18) {
  Bad "node $nodeVersion is too old — the Supabase client needs 18 or newer."
  exit 1
}
Good "node $nodeVersion"

# The server reads the app's own scoring engine and call schedule out of ../src,
# so it has to live inside a full checkout, not on its own.
Step 'Checking the checkout'
if (-not (Test-Path (Join-Path $here '..\src\calc.jsx'))) {
  Bad "this folder is not inside a gsteam-v2 checkout — ..\src\calc.jsx is missing.
       Clone the whole repo, not just this folder:
         git clone https://github.com/groundstandard/gsteam-v2.git
         cd gsteam-v2\mcp"
  exit 1
}
Good 'src/calc.jsx and src/calls-board.jsx are where the server expects them'

if (-not $SkipInstall) {
  Step 'Installing dependencies'
  Push-Location $here
  try { & npm install --silent; if ($LASTEXITCODE -ne 0) { throw 'npm install failed' } }
  finally { Pop-Location }
  Good 'dependencies installed'
}

Step 'Signing you in before touching any config'
$env:SUPABASE_URL = $SupabaseUrl
$env:SUPABASE_ANON_KEY = $AnonKey
$env:GSTEAM_EMAIL = $Email
$env:GSTEAM_PASSWORD = $Password
$env:SUPABASE_SERVICE_ROLE_KEY = ''
$env:GSTEAM_SERVICE_MODE = ''
$env:GSTEAM_ALLOW_WRITES = if ($ReadOnly) { '0' } else { '1' }

$probe = Join-Path $here 'probe.mjs'
@'
const m = await import('./server.js');
try {
  await m.signIn();
} catch (err) {
  console.log(err.message);
  process.exitCode = 1;
}
if (process.exitCode !== 1) {
  const r = await m.callTool('connection_info', {});
  console.log(r.content[0].text.split('\n')[0]);
  // process.exit() here kills node mid-write and Windows turns that into a
  // libuv assertion instead of the message. Set the code and let it finish.
  if (r.isError) process.exitCode = 1;
}
'@ | Set-Content -Path $probe -Encoding utf8

try {
  Push-Location $here
  $answer = & node probe.mjs 2>&1
  $code = $LASTEXITCODE
} finally {
  Pop-Location
  Remove-Item $probe -ErrorAction SilentlyContinue
}

if ($code -ne 0 -or $answer -notmatch 'Connected to') {
  Bad "could not sign you in:`n       $answer"
  Write-Host '       Nothing has been written to your Claude config.' -ForegroundColor Yellow
  Write-Host '       If you have never set a password, use Forgot password at https://gsteam-v2.vercel.app' -ForegroundColor Yellow
  exit 1
}
Good $answer

Step 'Writing the Claude Desktop config'
$cfgPath = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
if (-not (Test-Path $cfgPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $cfgPath) | Out-Null
  '{}' | Set-Content -Path $cfgPath -Encoding utf8
}

$backup = "$cfgPath.bak"
Copy-Item $cfgPath $backup -Force
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
if (-not $cfg.PSObject.Properties.Name.Contains('mcpServers')) {
  $cfg | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([PSCustomObject]@{})
}

$entry = [PSCustomObject]@{
  command = 'node'
  args    = @((Join-Path $here 'server.js'))
  env     = [PSCustomObject]@{
    SUPABASE_URL        = $SupabaseUrl
    SUPABASE_ANON_KEY   = $AnonKey
    GSTEAM_EMAIL        = $Email
    GSTEAM_PASSWORD     = $Password
    GSTEAM_ALLOW_WRITES = $(if ($ReadOnly) { '0' } else { '1' })
  }
}

if ($cfg.mcpServers.PSObject.Properties.Name -contains 'gsteam') {
  $cfg.mcpServers.gsteam = $entry
} else {
  $cfg.mcpServers | Add-Member -MemberType NoteProperty -Name gsteam -Value $entry
}

$cfg | ConvertTo-Json -Depth 10 | Set-Content -Path $cfgPath -Encoding utf8
Good "written to $cfgPath (previous version kept as $(Split-Path $backup -Leaf))"

$others = @($cfg.mcpServers.PSObject.Properties.Name | Where-Object { $_ -ne 'gsteam' })
if ($others.Count) { Good "left your other servers alone: $($others -join ', ')" }

Write-Host "`nDone. Two things left, and the first one matters:" -ForegroundColor Cyan
Write-Host "  1. Quit Claude Desktop properly — right-click it in the system tray and choose Quit."
Write-Host "     Closing the window only hides it, and the old connection stays up."
Write-Host "  2. Open it again and ask: " -NoNewline
Write-Host "Use the gsteam connection_info tool. Which scoreboard is it pointed at?" -ForegroundColor White
if ($ReadOnly) {
  Write-Host "`nWrites are OFF for you — the write tools are not even listed." -ForegroundColor Yellow
} else {
  Write-Host "`nWrites are ON and they are live. Anything you log shows up on the board for everyone," -ForegroundColor Yellow
  Write-Host "under your name - and the database holds you to exactly what you can do in the app." -ForegroundColor Yellow
}
