#!/usr/bin/env bash
# 下载 Mihomo 内核二进制到 src-tauri/binaries/，按 Tauri externalBin 命名规则命名。
# 用法: bash scripts/download-mihomo.sh [version]
#   version 可选，默认从 GitHub latest redirect 获取。

set -euo pipefail

REPO="MetaCubeX/mihomo"
BINARIES_DIR="src-tauri/binaries"
VERSION="${1:-}"

mkdir -p "$BINARIES_DIR"

# ── 检测平台和架构 ──────────────────────────────────────────

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux)   PLATFORM="linux"  ;;
  darwin)  PLATFORM="darwin" ;;
  mingw*|msys*|cygwin*) PLATFORM="windows" ;;
  *) echo "不支持的操作系统: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH_NAME="amd64"; RUST_TARGET="x86_64" ;;
  aarch64|arm64) ARCH_NAME="arm64"; RUST_TARGET="aarch64" ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

# ── Tauri externalBin 命名 ──────────────────────────────────

case "$PLATFORM" in
  linux)
    RUST_TRIPLE="${RUST_TARGET}-unknown-linux-gnu"
    SUFFIX=""
    ;;
  darwin)
    RUST_TRIPLE="${RUST_TARGET}-apple-darwin"
    SUFFIX=""
    ;;
  windows)
    RUST_TRIPLE="${RUST_TARGET}-pc-windows-msvc"
    SUFFIX=".exe"
    ;;
esac

DEST="$BINARIES_DIR/mihomo-${RUST_TRIPLE}${SUFFIX}"

# 已存在则跳过
if [ -f "$DEST" ]; then
  echo "mihomo 已存在: $DEST，跳过下载"
  exit 0
fi

# ── 获取版本号 ──────────────────────────────────────────────

if [ -z "$VERSION" ]; then
  echo "获取最新 release 版本..."
  # 跟踪 /releases/latest 重定向，从 Location header 提取 tag
  LATEST_URL=$(curl -fsSI -o /dev/null -w '%{redirect_url}' "https://github.com/$REPO/releases/latest" 2>/dev/null || true)
  if [ -n "$LATEST_URL" ]; then
    VERSION=$(echo "$LATEST_URL" | grep -oE '[^/]+$')
  fi
  # fallback: API（可能被限流）
  if [ -z "$VERSION" ]; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/' || true)
  fi
  if [ -z "$VERSION" ]; then
    echo "无法获取最新版本号，请手动指定: bash scripts/download-mihomo.sh <version>"
    exit 1
  fi
fi

echo "下载 Mihomo $VERSION ($PLATFORM/$ARCH_NAME)..."

# ── 构建下载 URL ────────────────────────────────────────────

ASSET_NAME="mihomo-${PLATFORM}-${ARCH_NAME}-${VERSION}.gz"
if [ "$PLATFORM" = "windows" ]; then
  ASSET_NAME="mihomo-${PLATFORM}-${ARCH_NAME}-${VERSION}.zip"
fi

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET_NAME"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "下载: $DOWNLOAD_URL"
curl -fSL "$DOWNLOAD_URL" -o "$TMP_DIR/$ASSET_NAME"

# ── 解压 ────────────────────────────────────────────────────

if [ "$PLATFORM" = "windows" ]; then
  unzip -o "$TMP_DIR/$ASSET_NAME" -d "$TMP_DIR"
  mv "$TMP_DIR/mihomo.exe" "$DEST"
else
  gunzip -c "$TMP_DIR/$ASSET_NAME" > "$DEST"
fi

chmod +x "$DEST"
echo "已下载: $DEST ($(du -h "$DEST" | cut -f1))"
