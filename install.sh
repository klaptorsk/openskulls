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

log_step()  { printf "${bold}${cyan}=>${reset} %s\n" "$1"; }
log_ok()    { printf "${green}✓${reset} %s\n" "$1"; }
log_warn()  { printf "${yellow}!${reset} %s\n" "$1"; }
log_error() { printf "${red}✗${reset} %s\n" "$1" >&2; }
die()       { log_error "$1"; exit 1; }

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

  log_step "Downloading openskulls for ${platform}..."

  mkdir -p "$INSTALL_DIR"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$INSTALL_DIR/openskulls" || die "Download failed. Check https://github.com/${REPO}/releases"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$INSTALL_DIR/openskulls" "$url" || die "Download failed. Check https://github.com/${REPO}/releases"
  else
    die "Neither curl nor wget found. Install one and retry."
  fi

  chmod +x "$INSTALL_DIR/openskulls"
  log_ok "Installed to $INSTALL_DIR/openskulls"
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
