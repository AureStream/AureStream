#!/usr/bin/env bash
set -euo pipefail

MIHOMO_VERSION="v1.19.24"
REPO="MetaCubeX/mihomo"
BINARIES_DIR="$(cd "$(dirname "$0")/../src-tauri/binaries" && pwd)"

# Mirror URL: set MIHOMO_MIRROR env to override (e.g. https://mirror.ghproxy.com)
MIRROR="${MIHOMO_MIRROR:-https://gh-proxy.org/https://github.com}"
BASE_URL="${MIRROR}/${REPO}/releases/download/${MIHOMO_VERSION}"

detect_platform() {
  local os arch ext target_triple

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    mingw*|msys*|cygwin*|windows*) os="windows"; ext="zip" ;;
    darwin*)  os="darwin";  ext="gz"  ;;
    linux*)   os="linux";   ext="gz"  ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="amd64"; target_triple="x86_64" ;;
    aarch64|arm64) arch="arm64";  target_triple="aarch64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  case "$os" in
    windows) target_triple="${target_triple}-pc-windows-msvc" ;;
    darwin)  target_triple="${target_triple}-apple-darwin" ;;
    linux)   target_triple="${target_triple}-unknown-linux-gnu" ;;
  esac

  local asset_name="mihomo-${os}-${arch}-${MIHOMO_VERSION}.${ext}"
  echo "${os} ${ext} ${asset_name} ${target_triple}"
}

main() {
  read -r os ext asset_name target_triple <<< "$(detect_platform)"
  local download_url="${BASE_URL}/${asset_name}"
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  echo "Downloading mihomo ${MIHOMO_VERSION} for ${target_triple}..."
  echo "URL: ${download_url}"

  if command -v curl &>/dev/null; then
    curl -fSL --progress-bar -o "${tmp_dir}/${asset_name}" "$download_url"
  elif command -v wget &>/dev/null; then
    wget --show-progress -O "${tmp_dir}/${asset_name}" "$download_url"
  else
    echo "Error: curl or wget required" >&2; exit 1
  fi

  if [ "$os" = "windows" ]; then
    unzip -oq "${tmp_dir}/${asset_name}" -d "${tmp_dir}/extracted"
    local exe_path
    exe_path="$(find "${tmp_dir}/extracted" -name 'mihomo*.exe' -type f | head -1)"
    [ -z "$exe_path" ] && { echo "Error: .exe not found in archive" >&2; exit 1; }
    cp "$exe_path" "${BINARIES_DIR}/mihomo-${target_triple}.exe"
    echo "Installed: ${BINARIES_DIR}/mihomo-${target_triple}.exe"
  else
    gunzip -c "${tmp_dir}/${asset_name}" > "${tmp_dir}/mihomo"
    chmod +x "${tmp_dir}/mihomo"
    cp "${tmp_dir}/mihomo" "${BINARIES_DIR}/mihomo-${target_triple}"
    echo "Installed: ${BINARIES_DIR}/mihomo-${target_triple}"
  fi

  rm -rf "$tmp_dir"
  echo "Done! mihomo ${MIHOMO_VERSION} is ready."
}

main "$@"
