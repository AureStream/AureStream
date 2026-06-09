# onebox-sysproxy-rs Makefile
# Cross-platform system proxy configuration tool

CARGO       := cargo
BINARY_NAME := sysproxy
TARGET_DIR  := target

# Release / Debug
PROFILE     ?= release
CARGO_FLAGS := $(if $(filter release,$(PROFILE)),--release,)

# Cross-compilation target (optional, e.g. x86_64-pc-windows-msvc)
TARGET      ?=
TARGET_FLAG := $(if $(TARGET),--target $(TARGET),)

# Output directory
ifeq ($(PROFILE),release)
  ifeq ($(TARGET),)
    OUT_DIR := $(TARGET_DIR)/release
  else
    OUT_DIR := $(TARGET_DIR)/$(TARGET)/release
  endif
else
  ifeq ($(TARGET),)
    OUT_DIR := $(TARGET_DIR)/debug
  else
    OUT_DIR := $(TARGET_DIR)/$(TARGET)/debug
  endif
endif

# Platform-specific binary extension
ifeq ($(OS),Windows_NT)
  BIN_EXT := .exe
else
  BIN_EXT :=
endif

BINARY := $(OUT_DIR)/$(BINARY_NAME)$(BIN_EXT)

# ─── Targets ───────────────────────────────────────────────────

.PHONY: all build build-debug check test test-integration clean install uninstall fmt lint doc help

## Default: build release binary
all: build

## Build the binary (default: release)
build:
	$(CARGO) build --bin $(BINARY_NAME) $(CARGO_FLAGS) $(TARGET_FLAG)
	@echo ""
	@echo "  ✅ Built: $(BINARY)"
	@echo ""

## Build debug binary
build-debug:
	$(CARGO) build --bin $(BINARY_NAME) $(TARGET_FLAG)
	@echo ""
	@echo "  ✅ Built (debug): $(TARGET_DIR)/debug/$(BINARY_NAME)$(BIN_EXT)"
	@echo ""

## Type-check without producing binary
check:
	$(CARGO) check $(TARGET_FLAG)

## Run all tests
test:
	$(CARGO) test $(TARGET_FLAG)

## Run all tests (verbose)
test-verbose:
	$(CARGO) test $(TARGET_FLAG) -- --nocapture

## Run integration tests (modifies system proxy, requires serial execution)
test-integration:
	$(CARGO) test --test integration $(TARGET_FLAG) -- --ignored --test-threads=1 --nocapture

## Format code
fmt:
	$(CARGO) fmt

## Format check (CI)
fmt-check:
	$(CARGO) fmt -- --check

## Lint with clippy
lint:
	$(CARGO) clippy $(TARGET_FLAG) -- -D warnings

## Generate documentation
doc:
	$(CARGO) doc --no-deps --open

## Install binary to ~/.cargo/bin
install:
	$(CARGO) install --path . --bin $(BINARY_NAME)
	@echo ""
	@echo "  ✅ Installed: $(BINARY_NAME)"
	@echo "     Run 'sysproxy --help' to get started."
	@echo ""

## Uninstall binary
uninstall:
	$(CARGO) uninstall $(shell $(CARGO) metadata --no-deps --format-version=1 | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4) 2>/dev/null || true
	@echo "  ✅ Uninstalled"

## Clean build artifacts
clean:
	$(CARGO) clean
	@echo "  ✅ Clean"

## Show help
help:
	@echo ""
	@echo "  onebox-sysproxy-rs — Cross-platform system proxy tool"
	@echo ""
	@echo "  Usage: make [target] [PROFILE=release|debug] [TARGET=<triple>]"
	@echo ""
	@echo "  Build Targets:"
	@echo "    build         Build release binary (default)"
	@echo "    build-debug   Build debug binary"
	@echo "    check         Type-check without binary output"
	@echo "    install       Install to ~/.cargo/bin"
	@echo "    uninstall     Remove from ~/.cargo/bin"
	@echo "    clean         Clean all build artifacts"
	@echo ""
	@echo "  Quality:"
	@echo "    test               Run all tests"
	@echo "    test-integration   Run integration tests (modifies system proxy)"
	@echo "    test-verbose       Run tests with output"
	@echo "    fmt           Format code"
	@echo "    fmt-check     Check formatting (CI)"
	@echo "    lint          Lint with clippy"
	@echo "    doc           Generate & open docs"
	@echo ""
	@echo "  Options:"
	@echo "    PROFILE       release (default) or debug"
	@echo "    TARGET        Cross-compile target triple"
	@echo ""
	@echo "  Examples:"
	@echo "    make                                    # Build release"
	@echo "    make build-debug                        # Build debug"
	@echo "    make TARGET=x86_64-pc-windows-msvc      # Cross-compile for Windows"
	@echo "    make TARGET=aarch64-apple-darwin         # Cross-compile for Apple Silicon"
	@echo "    make install                             # Install to PATH"
	@echo "    make test                                # Run tests"
	@echo ""
