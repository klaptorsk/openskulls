# OpenSkulls installer for Windows
#
# Install:  irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1 | iex
# Update:   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1))) --update

param(
  [switch]$Update
)

$ErrorActionPreference  = "Stop"
$ProgressPreference     = "SilentlyContinue"   # suppress Invoke-WebRequest's own progress bar
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Repo      = "klaptorsk/openskulls"
$InstallDir = if ($env:OPENSKULLS_INSTALL_DIR) { $env:OPENSKULLS_INSTALL_DIR } else { "$env:USERPROFILE\.local\bin" }
$BinName   = "openskulls.exe"
$BinPath   = Join-Path $InstallDir $BinName

function Write-Ok   { param($msg) Write-Host ([char]0x2713 + "  $msg") -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "!  $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host ([char]0x2717 + "  $msg") -ForegroundColor Red }
function Die        { param($msg) Write-Err $msg; exit 1 }

# ── Spinner ───────────────────────────────────────────────────────────────────
# Braille frames — same sequence as the ora npm package used in the CLI.

function Start-Spinner {
  param($Message)
  $shared = [hashtable]::Synchronized(@{ Running = $true })
  $rs = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace()
  $rs.Open()
  $ps = [System.Management.Automation.PowerShell]::Create()
  $ps.Runspace = $rs
  [void]$ps.AddScript({
    param($msg, $shared)
    $frames = [char[]]@(0x280B, 0x2819, 0x2839, 0x2838, 0x283C, 0x2834, 0x2826, 0x2827, 0x2807, 0x280F)
    $i = 0
    while ($shared.Running) {
      [Console]::Write("`r$($frames[$i % $frames.Length]) $msg")
      Start-Sleep -Milliseconds 80
      $i++
    }
  }).AddArgument($Message).AddArgument($shared)
  $handle = $ps.BeginInvoke()
  return @{ PS = $ps; RS = $rs; Handle = $handle; Shared = $shared }
}

function Stop-Spinner {
  param($s, $Msg, [switch]$Fail)
  $s.Shared.Running = $false
  Start-Sleep -Milliseconds 120   # let the spinner thread notice and exit
  $s.PS.Dispose()
  $s.RS.Dispose()
  $icon  = if ($Fail) { [char]0x2717 } else { [char]0x2713 }
  $color = if ($Fail) { "Red" } else { "Green" }
  Write-Host "`r$icon  $Msg" -ForegroundColor $color
}

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

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  $spin = Start-Spinner "Installing openskulls…"
  try {
    Invoke-WebRequest -Uri $url -OutFile $BinPath -UseBasicParsing
    Stop-Spinner $spin "Installed to $BinPath"
  } catch {
    Stop-Spinner $spin "Download failed" -Fail
    Die "Check https://github.com/$Repo/releases to download manually."
  }
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
  $spin = Start-Spinner "Verifying…"
  $ver = & openskulls --version 2>$null
  Stop-Spinner $spin "openskulls $ver ready"
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
