#!/usr/bin/env sh
# OpenSkulls installer
#
# Install:  curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh
# Update:   curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh -s -- --update
# Windows:  irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1 | iex

set -e

REPO="klaptorsk/openskulls"
INSTALL_DIR="${OPENSKULLS_INSTALL_DIR:-$HOME/.local/bin}"
MODE="install"

for arg in "$@"; do
  case "$arg" in
    --update|-u) MODE="update" ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────

reset='\033[0m'
bold='\033[1m'
green='\033[0;32m'
yellow='\033[0;33m'
red='\033[0;31m'
cyan='\033[0;36m'

log_ok()    { printf "${green}✓${reset} %s\n" "$1"; }
log_warn()  { printf "${yellow}!${reset} %s\n" "$1"; }
log_error() { printf "${red}✗${reset} %s\n" "$1" >&2; }
die()       { log_error "$1"; exit 1; }

# ── Spinner ───────────────────────────────────────────────────────────────────

_spin_pid=""

_spin_loop() {
  msg="$1"
  i=0
  while true; do
    case $((i % 4)) in
      0) f='|' ;; 1) f='/' ;; 2) f='-' ;; 3) f='\' ;;
    esac
    printf "\r${cyan}%s${reset} %s" "$f" "$msg"
    sleep 0.1
    i=$((i + 1))
  done
}

spin_start() {
  _spin_loop "$1" &
  _spin_pid=$!
}

spin_stop_ok() {
  if [ -n "$_spin_pid" ]; then
    kill "$_spin_pid" 2>/dev/null
    wait "$_spin_pid" 2>/dev/null || true
    _spin_pid=""
  fi
  printf "\r\033[K${green}✓${reset} %s\n" "$1"
}

spin_stop_fail() {
  if [ -n "$_spin_pid" ]; then
    kill "$_spin_pid" 2>/dev/null
    wait "$_spin_pid" 2>/dev/null || true
    _spin_pid=""
  fi
  printf "\r\033[K${red}✗${reset} %s\n" "$1" >&2
}

# Kill spinner on unexpected exit
trap 'if [ -n "$_spin_pid" ]; then kill "$_spin_pid" 2>/dev/null; printf "\r\033[K"; fi' EXIT

# ── Detect platform ───────────────────────────────────────────────────────────

detect_platform() {
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    linux*)  os="linux" ;;
    darwin*) os="darwin" ;;
    *)       die "Unsupported OS: $os. Use the Windows installer (install.ps1) on Windows." ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "Unsupported architecture: $arch" ;;
  esac

  echo "${os}-${arch}"
}

# ── Download binary ───────────────────────────────────────────────────────────

download_binary() {
  platform=$1
  url="https://github.com/${REPO}/releases/latest/download/openskulls-${platform}"

  mkdir -p "$INSTALL_DIR"
  spin_start "Downloading openskulls for ${platform}…"

  if command -v curl >/dev/null 2>&1; then
    if ! curl -fsSL "$url" -o "$INSTALL_DIR/openskulls" 2>/dev/null; then
      spin_stop_fail "Download failed"
      die "Check https://github.com/${REPO}/releases"
    fi
  elif command -v wget >/dev/null 2>&1; then
    if ! wget -qO "$INSTALL_DIR/openskulls" "$url" 2>/dev/null; then
      spin_stop_fail "Download failed"
      die "Check https://github.com/${REPO}/releases"
    fi
  else
    spin_stop_fail "No download tool found"
    die "Neither curl nor wget found. Install one and retry."
  fi

  chmod +x "$INSTALL_DIR/openskulls"
  spin_stop_ok "Installed to $INSTALL_DIR/openskulls"
}

# ── Verify ────────────────────────────────────────────────────────────────────

verify_install() {
  if ! command -v openskulls >/dev/null 2>&1; then
    if [ -x "$INSTALL_DIR/openskulls" ]; then
      log_warn "openskulls is installed but $INSTALL_DIR is not in PATH."
      log_warn "Add this to your shell profile:"
      log_warn "  export PATH=\"$INSTALL_DIR:\$PATH\""
      return 1
    fi
    die "Installation failed."
  fi

  version=$(openskulls --version 2>/dev/null || echo "unknown")
  log_ok "openskulls ${version} ready"
}

# ── Main ──────────────────────────────────────────────────────────────────────

if [ "$MODE" = "update" ]; then
  printf "\n${bold}OpenSkulls${reset} — updating to latest\n\n"
else
  printf "\n${bold}OpenSkulls${reset} — makes your repo readable to AI agents\n\n"
fi

platform=$(detect_platform)
log_ok "Platform: ${platform}"

download_binary "$platform"
verify_install

if [ "$MODE" = "install" ]; then
  printf "\n${bold}Get started:${reset}\n\n"
  printf "  cd your-project\n"
  printf "  openskulls init\n\n"
else
  printf "\n${bold}Done.${reset} Run ${cyan}openskulls --version${reset} to confirm.\n\n"
fi
