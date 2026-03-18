#!/usr/bin/env sh
# OpenSkulls installer / updater
#
# Install:  curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh
# Update:   curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh -s -- --update
# Windows:  irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1 | iex

set -e

PACKAGE="openskulls"
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

# ── Ensure bun ────────────────────────────────────────────────────────────────

BUN_BIN="$HOME/.bun/bin/bun"
export PATH="$HOME/.bun/bin:$PATH"

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    log_ok "bun $(bun --version)"
    return
  fi

  log_step "bun not found — installing bun..."
  curl -fsSL https://bun.sh/install | sh || die "Failed to install bun. Visit https://bun.sh to install manually."
  export PATH="$HOME/.bun/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1 && [ ! -x "$BUN_BIN" ]; then
    die "bun installed but not in PATH. Open a new terminal and re-run this installer."
  fi

  log_ok "bun $("$BUN_BIN" --version 2>/dev/null || bun --version)"
}

# ── Install ───────────────────────────────────────────────────────────────────

do_install() {
  log_step "${ACTION} ${PACKAGE}..."
  bun add --global "${PACKAGE}@latest"
}

# ── Verify ────────────────────────────────────────────────────────────────────

verify_install() {
  if ! command -v openskulls >/dev/null 2>&1; then
    log_warn "openskulls installed but not in PATH."
    log_warn "Add ~/.bun/bin to your PATH, then run: openskulls --version"
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

ensure_bun
do_install
verify_install

if [ "$MODE" = "install" ]; then
  printf "\n${bold}Get started:${reset}\n\n"
  printf "  cd your-project\n"
  printf "  openskulls init\n\n"
else
  printf "\n${bold}Done.${reset} Run ${cyan}openskulls --version${reset} to confirm.\n\n"
fi
