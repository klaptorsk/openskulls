#!/usr/bin/env sh
# OpenSkulls installer
# Usage: curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh

set -e

PACKAGE="openskulls"
MIN_NODE_MAJOR=20

# ── Colours ──────────────────────────────────────────────────────────────────

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

# ── Node.js check ─────────────────────────────────────────────────────────────

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    die "Node.js is not installed. Install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org and try again."
  fi

  node_version=$(node --version 2>/dev/null | sed 's/v//')
  node_major=$(echo "$node_version" | cut -d. -f1)

  if [ "$node_major" -lt "$MIN_NODE_MAJOR" ] 2>/dev/null; then
    die "Node.js ${MIN_NODE_MAJOR}+ is required (found v${node_version}). Upgrade at https://nodejs.org"
  fi

  log_ok "Node.js v${node_version}"
}

# ── Detect package manager ────────────────────────────────────────────────────

detect_package_manager() {
  # Prefer the manager the user already has globally
  if command -v bun >/dev/null 2>&1; then
    echo "bun"
  elif command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
  elif command -v npm >/dev/null 2>&1; then
    echo "npm"
  else
    die "No package manager found. Install npm (comes with Node.js), pnpm, or bun."
  fi
}

# ── Install ───────────────────────────────────────────────────────────────────

install_package() {
  pm=$1

  case "$pm" in
    bun)
      log_step "Installing via bun..."
      bun add --global "$PACKAGE"
      ;;
    pnpm)
      log_step "Installing via pnpm..."
      pnpm add --global "$PACKAGE"
      ;;
    npm)
      log_step "Installing via npm..."
      npm install --global "$PACKAGE"
      ;;
  esac
}

# ── Verify ────────────────────────────────────────────────────────────────────

verify_install() {
  if ! command -v openskulls >/dev/null 2>&1; then
    log_warn "openskulls is installed but not in PATH."
    log_warn "Add your global bin directory to PATH and retry."
    log_warn "  npm:  \$(npm bin -g)"
    log_warn "  pnpm: \$(pnpm bin -g)"
    log_warn "  bun:  ~/.bun/bin"
    return 1
  fi

  version=$(openskulls --version 2>/dev/null || echo "unknown")
  log_ok "openskulls ${version} installed successfully"
}

# ── Main ──────────────────────────────────────────────────────────────────────

printf "\n${bold}OpenSkulls${reset} — makes your repo readable to AI agents\n\n"

check_node
pm=$(detect_package_manager)
log_ok "Package manager: ${pm}"

install_package "$pm"
verify_install

printf "\n${bold}Get started:${reset}\n\n"
printf "  cd your-project\n"
printf "  openskulls init\n\n"
