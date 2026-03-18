#!/usr/bin/env sh
# OpenSkulls global uninstaller
#
# Removes the openskulls binary from your system.
# To clean up a specific repo (git hook, .openskulls/ dir) run:
#   openskulls uninstall   (inside the repo)
#
# Usage:   curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/uninstall.sh | sh
# Windows: irm https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.ps1 | iex  # then: bun remove --global openskulls

set -e

PACKAGE="openskulls"

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

# ── Detect package manager ────────────────────────────────────────────────────

export PATH="$HOME/.bun/bin:$HOME/.local/share/pnpm:$HOME/.pnpm/bin:$PATH"

detect_package_manager() {
  if command -v bun >/dev/null 2>&1; then
    echo "bun"
  elif command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
  else
    die "No package manager found. Run: bun remove --global ${PACKAGE}"
  fi
}

# ── Verify ────────────────────────────────────────────────────────────────────

verify_removed() {
  if command -v openskulls >/dev/null 2>&1; then
    log_warn "openskulls is still in PATH — another installation may exist."
    log_warn "Location: $(command -v openskulls)"
  else
    log_ok "openskulls removed"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

printf "\n${bold}OpenSkulls${reset} — uninstalling\n\n"

if ! command -v openskulls >/dev/null 2>&1; then
  log_warn "openskulls is not installed (or not in PATH). Nothing to do."
  exit 0
fi

pm=$(detect_package_manager)
log_step "Removing via ${pm}..."
"$pm" remove --global "$PACKAGE"
verify_removed

printf "\n${bold}Done.${reset} Your repo files (.openskulls/, CLAUDE.md) are untouched.\n"
printf "To clean up a repo, run ${cyan}openskulls uninstall${reset} inside it first.\n\n"
