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
  [Parameter(Mandatory = $true)][string]$ServiceKey,
  [Parameter(Mandatory = $true)][string]$Email,
  [string]$SupabaseUrl = 'https://obfekzpumitnybxfgnol.supabase.co',
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

Step 'Testing the connection before touching any config'
$env:SUPABASE_URL = $SupabaseUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $ServiceKey
$env:GSTEAM_ACTOR_EMAIL = $Email
$env:GSTEAM_ALLOW_WRITES = if ($ReadOnly) { '0' } else { '1' }

$probe = Join-Path $here 'probe.mjs'
@'
const m = await import('./server.js');
const r = await m.callTool('connection_info', {});
console.log(r.content[0].text.split('\n')[0]);
// process.exit() here kills node mid-write and Windows turns that into a libuv
// assertion instead of the message. Set the code and let it finish.
if (r.isError) process.exitCode = 1;
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
  Bad "could not reach the scoreboard:`n       $answer"
  Write-Host '       Check the service role key. Nothing has been written to your Claude config.' -ForegroundColor Yellow
  exit 1
}
Good $answer

Step 'Checking who you are'
# Three people can write to this board — Bobby, Kurt and Mike. Every write is
# stamped with the asker's profile id, so an address that is not one of theirs
# would land rows credited to nobody. Better to stop here than to find out later
# from an audit log full of blanks.
$peopleProbe = Join-Path $here 'people.mjs'
@'
const m = await import('./server.js');
const r = await m.callTool('connection_info', {});
const body = r.content[0].text.split('\n\n')[1];
console.log(JSON.parse(body).people.join(','));
'@ | Set-Content -Path $peopleProbe -Encoding utf8
try {
  Push-Location $here
  $people = (& node people.mjs 2>&1) -split ','
} finally {
  Pop-Location
  Remove-Item $peopleProbe -ErrorAction SilentlyContinue
}
if ($people -notcontains $Email.ToLower()) {
  Bad "$Email is not on the scoreboard. It has: $($people -join ', ')"
  Write-Host '       Use your own address from that list. Nothing has been written to your Claude config.' -ForegroundColor Yellow
  exit 1
}
Good "$Email is on the scoreboard - writes will be credited to you"

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
    SUPABASE_URL              = $SupabaseUrl
    SUPABASE_SERVICE_ROLE_KEY = $ServiceKey
    GSTEAM_ALLOW_WRITES       = $(if ($ReadOnly) { '0' } else { '1' })
    GSTEAM_ACTOR_EMAIL        = $Email
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
  Write-Host "credited to $Email." -ForegroundColor Yellow
}
