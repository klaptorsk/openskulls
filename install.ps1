# OpenSkulls installer for Windows
#
# Install:  irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1 | iex
# Update:   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1))) --update

param(
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$Repo      = "klaptorsk/openskulls"
$InstallDir = if ($env:OPENSKULLS_INSTALL_DIR) { $env:OPENSKULLS_INSTALL_DIR } else { "$env:USERPROFILE\.local\bin" }
$BinName   = "openskulls.exe"
$BinPath   = Join-Path $InstallDir $BinName

function Write-Step { param($msg) Write-Host "=> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host ([char]0x2713 + "  $msg") -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "!  $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host ([char]0x2717 + "  $msg") -ForegroundColor Red }
function Die        { param($msg) Write-Err $msg; exit 1 }

# ── Detect platform ───────────────────────────────────────────────────────────

function Get-Platform {
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
  switch ($arch) {
    'X64'   { return "windows-x64" }
    'Arm64' { return "windows-arm64" }
    default { Die "Unsupported architecture: $arch" }
  }
}

# ── Download binary ───────────────────────────────────────────────────────────

function Install-Binary {
  param($platform)
  $url = "https://github.com/$Repo/releases/latest/download/openskulls-$platform.exe"

  Write-Step "Downloading openskulls for $platform..."

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  try {
    Invoke-WebRequest -Uri $url -OutFile $BinPath -UseBasicParsing
  } catch {
    Die "Download failed. Check https://github.com/$Repo/releases"
  }

  Write-Ok "Installed to $BinPath"
}

# ── Ensure install dir is in PATH ─────────────────────────────────────────────

function Ensure-InPath {
  $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
  if ($userPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$InstallDir;$userPath", "User")
    $env:PATH = "$InstallDir;$env:PATH"
    Write-Ok "Added $InstallDir to user PATH"
  }
}

# ── Verify ────────────────────────────────────────────────────────────────────

function Verify-Install {
  $cmd = Get-Command openskulls -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Warn "openskulls is installed but not yet in PATH for this session."
    Write-Warn "Open a new terminal, or run: $BinPath --version"
    return
  }
  $ver = & openskulls --version 2>$null
  Write-Ok "openskulls $ver ready"
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "OpenSkulls" -ForegroundColor White -NoNewline
if ($Update) {
  Write-Host " — updating to latest"
} else {
  Write-Host " — makes your repo readable to AI agents"
}
Write-Host ""

$platform = Get-Platform
Write-Ok "Platform: $platform"

Install-Binary $platform
Ensure-InPath
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
