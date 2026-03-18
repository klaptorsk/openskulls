# OpenSkulls installer for Windows
#
# Install:  irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1 | iex
# Update:   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1))) --update

param(
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$Package = "openskulls"
$BunHome = "$env:USERPROFILE\.bun"
$BunExe  = "$BunHome\bin\bun.exe"

function Write-Step { param($msg) Write-Host "=> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host ([char]0x2713 + "  $msg") -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "!  $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host ([char]0x2717 + "  $msg") -ForegroundColor Red }
function Die        { param($msg) Write-Err $msg; exit 1 }

# ── Ensure bun ────────────────────────────────────────────────────────────────

function Ensure-Bun {
  $bun = Get-Command bun -ErrorAction SilentlyContinue
  if ($bun) {
    $ver = & bun --version 2>$null
    Write-Ok "bun $ver"
    return "bun"
  }

  if (Test-Path $BunExe) {
    $ver = & $BunExe --version 2>$null
    Write-Ok "bun $ver"
    return $BunExe
  }

  Write-Step "bun not found — installing bun..."
  try {
    irm bun.sh/install | iex
  } catch {
    Die "Failed to install bun. Visit https://bun.sh to install manually."
  }

  if (-not (Test-Path $BunExe)) {
    Die "bun installation failed. Open a new terminal and re-run this installer."
  }

  $ver = & $BunExe --version 2>$null
  Write-Ok "bun $ver"
  return $BunExe
}

# ── Install ───────────────────────────────────────────────────────────────────

function Install-OpenSkulls {
  param($bun)
  Write-Step "$Action $Package..."
  & $bun add --global "${Package}@latest"
}

# ── Verify ────────────────────────────────────────────────────────────────────

function Verify-Install {
  $cmd = Get-Command openskulls -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Warn "openskulls installed but not in PATH."
    Write-Warn "Add $BunHome\bin to your PATH, then run: openskulls --version"
    return
  }
  $ver = & openskulls --version 2>$null
  Write-Ok "openskulls $ver ready"
}

# ── Main ──────────────────────────────────────────────────────────────────────

if ($Update) {
  $Action = "Updating"
  Write-Host ""
  Write-Host "OpenSkulls" -ForegroundColor White -NoNewline
  Write-Host " — updating to latest"
  Write-Host ""
} else {
  $Action = "Installing"
  Write-Host ""
  Write-Host "OpenSkulls" -ForegroundColor White -NoNewline
  Write-Host " — makes your repo readable to AI agents"
  Write-Host ""
}

$bun = Ensure-Bun
Install-OpenSkulls $bun
Verify-Install

if (-not $Update) {
  Write-Host ""
  Write-Host "Get started:" -ForegroundColor White
  Write-Host ""
  Write-Host "  cd your-project"
  Write-Host "  openskulls init"
  Write-Host ""
} else {
  Write-Host ""
  Write-Host "Done. Run " -NoNewline
  Write-Host "openskulls --version" -ForegroundColor Cyan -NoNewline
  Write-Host " to confirm."
  Write-Host ""
}
