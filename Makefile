# AureStream Build Makefile
# Usage:
#   make dev              - 开发模式（Tauri dev）
#   make build            - 构建当前平台的安装包
#   make build-win        - 构建 Windows x64 安装包
#   make build-win-arm64  - 构建 Windows ARM64 安装包
#   make build-mac        - 构建 macOS 安装包 (当前架构)
#   make build-mac-universal - 构建 macOS Universal 安装包
#   make build-linux      - 构建 Linux x64 安装包
#   make build-linux-arm64 - 构建 Linux ARM64 安装包
#   make download-mihomo  - 下载当前平台的 mihomo 二进制
#   make download-mihomo-all - 下载所有平台的 mihomo 二进制
#   make clean            - 清理构建产物

MIHOMO_VERSION  := v1.19.24
MIHOMO_REPO     := MetaCubeX/mihomo
MIHOMO_MIRROR   ?= https://gh-proxy.org/https://github.com
MIHOMO_BASE_URL := $(MIHOMO_MIRROR)/$(MIHOMO_REPO)/releases/download/$(MIHOMO_VERSION)
BINARIES_DIR    := src-tauri/binaries

# ---- 平台目标三元组 ----
WIN_X64         := x86_64-pc-windows-msvc
WIN_ARM64       := aarch64-pc-windows-msvc
MAC_X64         := x86_64-apple-darwin
MAC_ARM64       := aarch64-apple-darwin
LINUX_X64       := x86_64-unknown-linux-gnu
LINUX_ARM64     := aarch64-unknown-linux-gnu

# ---- 当前平台检测 ----
UNAME_S := $(shell uname -s 2>/dev/null || echo Windows_NT)
UNAME_M := $(shell uname -m 2>/dev/null || echo x86_64)

ifneq (,$(findstring MINGW,$(UNAME_S)))
  HOST_OS := windows
else ifneq (,$(findstring MSYS,$(UNAME_S)))
  HOST_OS := windows
else ifneq (,$(findstring CYGWIN,$(UNAME_S)))
  HOST_OS := windows
else ifeq ($(UNAME_S),Windows_NT)
  HOST_OS := windows
else ifeq ($(UNAME_S),Darwin)
  HOST_OS := darwin
else
  HOST_OS := linux
endif

ifeq ($(HOST_OS),windows)
  HOST_TARGET   := $(WIN_X64)
  HOST_OS_NAME  := windows
  HOST_ARCH     := amd64
  HOST_EXT      := zip
  BIN_EXT       := .exe
else ifeq ($(HOST_OS),darwin)
  ifeq ($(UNAME_M),arm64)
    HOST_TARGET := $(MAC_ARM64)
    HOST_ARCH   := arm64
  else
    HOST_TARGET := $(MAC_X64)
    HOST_ARCH   := amd64
  endif
  HOST_OS_NAME := darwin
  HOST_EXT     := gz
  BIN_EXT      :=
else
  ifeq ($(UNAME_M),aarch64)
    HOST_TARGET := $(LINUX_ARM64)
    HOST_ARCH   := arm64
  else
    HOST_TARGET := $(LINUX_X64)
    HOST_ARCH   := amd64
  endif
  HOST_OS_NAME := linux
  HOST_EXT     := gz
  BIN_EXT      :=
endif

# ---- 工具检查 ----
.PHONY: check-tools
check-tools:
	@echo "检查构建工具..."
	@command -v node >/dev/null 2>&1 || { echo "错误: 未找到 node，请先安装 Node.js"; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { echo "错误: 未找到 cargo，请先安装 Rust"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "错误: 未找到 npm"; exit 1; }
	@node --version
	@cargo --version
	@echo "工具检查通过"

# ---- 安装依赖 ----
.PHONY: install
install:
	npm install

# ---- 开发模式 ----
.PHONY: dev
dev: install
	npm run tauri:dev

# ---- 下载 mihomo 辅助宏 ----
# $(1)=os $(2)=arch $(3)=target_triple $(4)=ext(bin_ext)
define download_mihomo_one
	@mkdir -p $(BINARIES_DIR)
	$(eval ASSET := mihomo-$(1)-$(2)-$(MIHOMO_VERSION).$(3))
	$(eval OUT   := $(BINARIES_DIR)/mihomo-$(4)$(5))
	@if [ -f "$(OUT)" ]; then \
		echo "已存在: $(OUT)，跳过"; \
	else \
		echo "下载 mihomo $(4)..."; \
		echo "URL: $(MIHOMO_BASE_URL)/$(ASSET)"; \
		curl -fSL --progress-bar -o "/tmp/$(ASSET)" "$(MIHOMO_BASE_URL)/$(ASSET)" || \
		{ echo "下载失败: $(4)"; rm -f "/tmp/$(ASSET)"; exit 1; }; \
		if [ "$(3)" = "zip" ]; then \
			unzip -oq "/tmp/$(ASSET)" -d "/tmp/mihomo-extract" && \
			cp "/tmp/mihomo-extract/mihomo$(5)" "$(OUT)" && \
			rm -rf "/tmp/mihomo-extract"; \
		else \
			gunzip -c "/tmp/$(ASSET)" > "$(OUT)" && \
			chmod +x "$(OUT)"; \
		fi && \
		rm -f "/tmp/$(ASSET)" && \
		echo "已保存: $(OUT)"; \
	fi
endef

# ---- 下载当前平台 mihomo ----
.PHONY: download-mihomo
download-mihomo:
	$(call download_mihomo_one,$(HOST_OS_NAME),$(HOST_ARCH),$(HOST_EXT),$(HOST_TARGET),$(BIN_EXT))

# ---- 下载所有平台 mihomo ----
.PHONY: download-mihomo-all
download-mihomo-all:
	$(call download_mihomo_one,windows,amd64,zip,$(WIN_X64),.exe)
	$(call download_mihomo_one,windows,arm64,zip,$(WIN_ARM64),.exe)
	$(call download_mihomo_one,darwin,amd64,gz,$(MAC_X64),)
	$(call download_mihomo_one,darwin,arm64,gz,$(MAC_ARM64),)
	$(call download_mihomo_one,linux,amd64,gz,$(LINUX_X64),)
	$(call download_mihomo_one,linux,arm64,gz,$(LINUX_ARM64),)
	@echo ""
	@echo "所有 mihomo 二进制下载完成:"
	@ls -la $(BINARIES_DIR)/

# ---- 构建当前平台 ----
.PHONY: build
build: install check-tools download-mihomo
	npm run tauri:build

# ---- 构建 Windows x64 ----
.PHONY: build-win
build-win: install check-tools
	$(call download_mihomo_one,windows,amd64,zip,$(WIN_X64),.exe)
	npm run tauri:build -- --target $(WIN_X64)

# ---- 构建 Windows ARM64 ----
.PHONY: build-win-arm64
build-win-arm64: install check-tools
	$(call download_mihomo_one,windows,arm64,zip,$(WIN_ARM64),.exe)
	npm run tauri:build -- --target $(WIN_ARM64)

# ---- 构建 macOS (当前架构) ----
.PHONY: build-mac
build-mac: install check-tools
	$(call download_mihomo_one,darwin,$(HOST_ARCH),gz,$(HOST_TARGET),)
	npm run tauri:build -- --target $(HOST_TARGET)

# ---- 构建 macOS universal ----
.PHONY: build-mac-universal
build-mac-universal: install check-tools
	$(call download_mihomo_one,darwin,amd64,gz,$(MAC_X64),)
	$(call download_mihomo_one,darwin,arm64,gz,$(MAC_ARM64),)
	npm run tauri:build -- --target universal-apple-darwin

# ---- 构建 Linux x64 ----
.PHONY: build-linux
build-linux: install check-tools
	$(call download_mihomo_one,linux,amd64,gz,$(LINUX_X64),)
	npm run tauri:build -- --target $(LINUX_X64)

# ---- 构建 Linux ARM64 ----
.PHONY: build-linux-arm64
build-linux-arm64: install check-tools
	$(call download_mihomo_one,linux,arm64,gz,$(LINUX_ARM64),)
	npm run tauri:build -- --target $(LINUX_ARM64)

# ---- 仅构建前端 ----
.PHONY: build-frontend
build-frontend: install
	npm run build

# ---- 类型检查 ----
.PHONY: typecheck
typecheck:
	npm run typecheck

# ---- 清理 ----
.PHONY: clean
clean:
	rm -rf dist
	rm -rf src-tauri/target
	rm -rf src-tauri/binaries/mihomo-*
	@echo "清理完成"

.PHONY: clean-build
clean-build:
	rm -rf src-tauri/target/release
	rm -rf src-tauri/target/debug
	@echo "构建缓存已清理"

# ---- 帮助 ----
.PHONY: help
help:
	@echo ""
	@echo "AureStream 构建系统"
	@echo "=================="
	@echo ""
	@echo "  make dev                    启动开发模式 (Tauri dev + 热重载)"
	@echo "  make build                  构建当前平台的安装包"
	@echo "  make build-win              构建 Windows x64 安装包"
	@echo "  make build-win-arm64        构建 Windows ARM64 安装包"
	@echo "  make build-mac              构建 macOS 安装包 (当前架构)"
	@echo "  make build-mac-universal    构建 macOS Universal 安装包"
	@echo "  make build-linux            构建 Linux x64 安装包"
	@echo "  make build-linux-arm64      构建 Linux ARM64 安装包"
	@echo "  make download-mihomo        下载当前平台的 mihomo 二进制"
	@echo "  make download-mihomo-all    下载所有平台的 mihomo 二进制"
	@echo "  make install                安装 npm 依赖"
	@echo "  make typecheck              TypeScript 类型检查"
	@echo "  make clean                  清理所有构建产物"
	@echo "  make clean-build            仅清理 Rust 构建缓存"
	@echo ""
	@echo "变量:"
	@echo "  MIHOMO_VERSION=$(MIHOMO_VERSION)   mihomo 版本"
	@echo "  MIHOMO_MIRROR=$(MIHOMO_MIRROR)   下载镜像"
	@echo "  HOST_TARGET=$(HOST_TARGET)  当前平台目标"
	@echo ""

.DEFAULT_GOAL := help
