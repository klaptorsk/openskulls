#!/usr/bin/env sh
# OpenSkulls installer / updater
#
# Install:  curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh
# Update:   curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh -s -- --update

set -e

PACKAGE="openskulls"
MIN_NODE_MAJOR=20
MODE="install"  # "install" | "update"

# ── Parse flags ───────────────────────────────────────────────────────────────

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
  if command -v bun >/dev/null 2>&1; then
    echo "bun"
  elif command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
  else
    die "No package manager found. Install bun (https://bun.sh) or pnpm."
  fi
}

# ── Install / Update ──────────────────────────────────────────────────────────

install_package() {
  pm=$1
  target="${PACKAGE}@latest"

  case "$pm" in
    bun)
      log_step "${ACTION} via bun..."
      bun add --global "$target"
      ;;
    pnpm)
      log_step "${ACTION} via pnpm..."
      pnpm add --global "$target"
      ;;
  esac
}

# ── Verify ────────────────────────────────────────────────────────────────────

verify_install() {
  if ! command -v openskulls >/dev/null 2>&1; then
    log_warn "openskulls is installed but not in PATH."
    log_warn "Add your global bin directory to PATH and retry."
    log_warn "  bun:  ~/.bun/bin"
    log_warn "  pnpm: \$(pnpm bin -g)"
    return 1
  fi

  version=$(openskulls --version 2>/dev/null || echo "unknown")
  log_ok "openskulls ${version} ready"
}

# ── Main ──────────────────────────────────────────────────────────────────────

if [ "$MODE" = "update" ]; then
  ACTION="Updating"
  printf "\n${bold}OpenSkulls${reset} — updating to latest\n\n"
else
  ACTION="Installing"
  printf "\n${bold}OpenSkulls${reset} — makes your repo readable to AI agents\n\n"
fi

pm=$(detect_package_manager)
log_ok "Package manager: ${pm}"

# Only require Node.js when bun isn't available (bun includes its own runtime)
if [ "$pm" != "bun" ]; then
  check_node
fi

install_package "$pm"
verify_install

if [ "$MODE" = "install" ]; then
  printf "\n${bold}Get started:${reset}\n\n"
  printf "  cd your-project\n"
  printf "  openskulls init\n\n"
else
  printf "\n${bold}Done.${reset} Run ${cyan}openskulls --version${reset} to confirm.\n\n"
fi
