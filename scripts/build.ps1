# AureStream Build Script (PowerShell)
# Usage:
#   .\scripts\build.ps1 dev              - Dev mode (Tauri dev)
#   .\scripts\build.ps1 build            - Build for current platform
#   .\scripts\build.ps1 build-win        - Build Windows x64 installer
#   .\scripts\build.ps1 build-win-arm64  - Build Windows ARM64 installer
#   .\scripts\build.ps1 download         - Download current platform mihomo
#   .\scripts\build.ps1 download-all     - Download all platform mihomo
#   .\scripts\build.ps1 clean            - Clean build artifacts

param(
    [Parameter(Position = 0)]
    [ValidateSet('dev', 'build', 'build-win', 'build-win-arm64', 'build-mac', 'build-linux',
        'download', 'download-all', 'install', 'typecheck', 'clean', 'clean-build', 'help')]
    [string]$Command = 'help'
)

# Force UTF-8 for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$MIHOMO_VERSION = 'v1.19.24'
$MIHOMO_REPO = 'MetaCubeX/mihomo'
$MIHOMO_MIRROR = if ($env:MIHOMO_MIRROR) { $env:MIHOMO_MIRROR } else { 'https://gh-proxy.org/https://github.com' }
$MIHOMO_BASE_URL = "$MIHOMO_MIRROR/$MIHOMO_REPO/releases/download/$MIHOMO_VERSION"
$BINARIES_DIR = Join-Path $PSScriptRoot '..\src-tauri\binaries'
$ROOT_DIR = Join-Path $PSScriptRoot '..'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    $msg" -ForegroundColor Red }

function Test-Tools {
    Write-Step "检查构建工具..."
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { Write-Err "未找到 node，请先安装 Node.js"; exit 1 }
    $cargo = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $cargo) { Write-Err "未找到 cargo，请先安装 Rust"; exit 1 }
    Write-Ok "node $(node --version)"
    Write-Ok "cargo $(cargo --version)"
    Write-Ok "工具检查通过"
}

function Install-Deps {
    Write-Step "安装 npm 依赖..."
    Push-Location $ROOT_DIR
    npm install
    Pop-Location
}

function Download-Mihomo {
    param(
        [string]$Os,        # windows, darwin, linux
        [string]$Arch,      # amd64, arm64
        [string]$TargetTriple, # e.g. x86_64-pc-windows-msvc
        [string]$Ext,       # zip or gz
        [string]$BinExt     # .exe or empty
    )

    if (-not (Test-Path $BINARIES_DIR)) {
        New-Item -ItemType Directory -Path $BINARIES_DIR -Force | Out-Null
    }

    $assetName = "mihomo-${Os}-${Arch}-${MIHOMO_VERSION}.${Ext}"
    $outFile = Join-Path $BINARIES_DIR "mihomo-${TargetTriple}${BinExt}"

    if (Test-Path $outFile) {
        Write-Ok "已存在: mihomo-${TargetTriple}${BinExt}，跳过"
        return
    }

    $downloadUrl = "$MIHOMO_BASE_URL/$assetName"
    $tmpFile = Join-Path $env:TEMP $assetName
    $tmpDir = Join-Path $env:TEMP "mihomo-extract-$(Get-Random)"

    Write-Step "下载 mihomo ${TargetTriple}..."
    Write-Host "    URL: $downloadUrl"

    try {
        # Use TLS 1.2
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpFile -UseBasicParsing
    }
    catch {
        Write-Err "下载失败: $_"
        if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force }
        return
    }

    if ($Ext -eq 'zip') {
        Write-Step "解压 zip..."
        New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
        Expand-Archive -Path $tmpFile -DestinationPath $tmpDir -Force
        $exe = Get-ChildItem -Path $tmpDir -Filter "mihomo*${BinExt}" -Recurse | Select-Object -First 1
        if (-not $exe) {
            Write-Err "zip 中未找到 mihomo 可执行文件"
            Remove-Item $tmpFile -Force
            Remove-Item $tmpDir -Recurse -Force
            return
        }
        Copy-Item $exe.FullName $outFile -Force
        Remove-Item $tmpDir -Recurse -Force
    }
    else {
        # .gz - use 7z or gunzip
        Write-Step "解压 gz..."
        $sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
        if ($sevenZip) {
            & 7z e $tmpFile -o"$tmpDir" -y | Out-Null
            $extracted = Get-ChildItem -Path $tmpDir -Filter "mihomo*" | Select-Object -First 1
            if ($extracted) {
                Copy-Item $extracted.FullName $outFile -Force
            }
        }
        else {
            Write-Warn "需要 7z 来解压 .gz 文件，请安装 7-Zip"
            Write-Warn "或手动解压 $tmpFile 到 $outFile"
        }
        if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    }

    Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
    Write-Ok "已保存: mihomo-${TargetTriple}${BinExt}"
}

function Download-CurrentPlatform {
    Write-Step "下载当前平台 mihomo..."
    # Windows x64
    Download-Mihomo -Os 'windows' -Arch 'amd64' -TargetTriple 'x86_64-pc-windows-msvc' -Ext 'zip' -BinExt '.exe'
}

function Download-AllPlatforms {
    Write-Step "下载所有平台 mihomo..."
    Download-Mihomo -Os 'windows' -Arch 'amd64' -TargetTriple 'x86_64-pc-windows-msvc' -Ext 'zip' -BinExt '.exe'
    Download-Mihomo -Os 'windows' -Arch 'arm64' -TargetTriple 'aarch64-pc-windows-msvc' -Ext 'zip' -BinExt '.exe'
    Download-Mihomo -Os 'darwin' -Arch 'amd64' -TargetTriple 'x86_64-apple-darwin' -Ext 'gz' -BinExt ''
    Download-Mihomo -Os 'darwin' -Arch 'arm64' -TargetTriple 'aarch64-apple-darwin' -Ext 'gz' -BinExt ''
    Download-Mihomo -Os 'linux' -Arch 'amd64' -TargetTriple 'x86_64-unknown-linux-gnu' -Ext 'gz' -BinExt ''
    Download-Mihomo -Os 'linux' -Arch 'arm64' -TargetTriple 'aarch64-unknown-linux-gnu' -Ext 'gz' -BinExt ''
    Write-Ok "所有 mihomo 二进制下载完成"
    Get-ChildItem $BINARIES_DIR | Format-Table Name, Length, LastWriteTime
}

function Invoke-Build {
    param([string]$Target = '')

    Install-Deps
    Test-Tools
    Download-CurrentPlatform

    Push-Location $ROOT_DIR
    if ($Target) {
        Write-Step "构建目标: $Target"
        npm run tauri:build -- --target $Target
    }
    else {
        Write-Step "构建当前平台..."
        npm run tauri:build
    }
    Pop-Location
}

# ---- Main ----
Push-Location $ROOT_DIR
try {
    switch ($Command) {
        'dev' {
            Install-Deps
            npm run tauri:dev
        }
        'build' {
            Invoke-Build
        }
        'build-win' {
            Install-Deps
            Test-Tools
            Download-Mihomo -Os 'windows' -Arch 'amd64' -TargetTriple 'x86_64-pc-windows-msvc' -Ext 'zip' -BinExt '.exe'
            npm run tauri:build -- --target x86_64-pc-windows-msvc
        }
        'build-win-arm64' {
            Install-Deps
            Test-Tools
            Download-Mihomo -Os 'windows' -Arch 'arm64' -TargetTriple 'aarch64-pc-windows-msvc' -Ext 'zip' -BinExt '.exe'
            npm run tauri:build -- --target aarch64-pc-windows-msvc
        }
        'build-mac' {
            Write-Warn "macOS 构建需要在 macOS 上执行"
        }
        'build-linux' {
            Write-Warn "Linux 构建需要在 Linux 上执行或配置交叉编译工具链"
        }
        'download' {
            Download-CurrentPlatform
        }
        'download-all' {
            Download-AllPlatforms
        }
        'install' {
            Install-Deps
        }
        'typecheck' {
            npm run typecheck
        }
        'clean' {
            Write-Step "清理构建产物..."
            $dirs = @('dist', 'src-tauri\target')
            foreach ($d in $dirs) {
                $full = Join-Path $ROOT_DIR $d
                if (Test-Path $full) {
                    Remove-Item $full -Recurse -Force
                    Write-Ok "已删除: $d"
                }
            }
            # Remove mihomo binaries
            Get-ChildItem $BINARIES_DIR -Filter 'mihomo-*' -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-Item $_.FullName -Force
                Write-Ok "已删除: $($_.Name)"
            }
            Write-Ok "清理完成"
        }
        'clean-build' {
            Write-Step "清理 Rust 构建缓存..."
            $releaseDir = Join-Path $ROOT_DIR 'src-tauri\target\release'
            $debugDir = Join-Path $ROOT_DIR 'src-tauri\target\debug'
            if (Test-Path $releaseDir) { Remove-Item $releaseDir -Recurse -Force; Write-Ok "已删除 target/release" }
            if (Test-Path $debugDir) { Remove-Item $debugDir -Recurse -Force; Write-Ok "已删除 target/debug" }
        }
        'help' {
            Write-Host ""
            Write-Host "AureStream 构建系统 (PowerShell)" -ForegroundColor Cyan
            Write-Host "==============================" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "  .\scripts\build.ps1 dev              启动开发模式 (Tauri dev + 热重载)"
            Write-Host "  .\scripts\build.ps1 build            构建当前平台的安装包"
            Write-Host "  .\scripts\build.ps1 build-win        构建 Windows x64 安装包"
            Write-Host "  .\scripts\build.ps1 build-win-arm64  构建 Windows ARM64 安装包"
            Write-Host "  .\scripts\build.ps1 download         下载当前平台 mihomo"
            Write-Host "  .\scripts\build.ps1 download-all     下载所有平台 mihomo"
            Write-Host "  .\scripts\build.ps1 install          安装 npm 依赖"
            Write-Host "  .\scripts\build.ps1 typecheck        TypeScript 类型检查"
            Write-Host "  .\scripts\build.ps1 clean            清理所有构建产物"
            Write-Host "  .\scripts\build.ps1 clean-build      仅清理 Rust 构建缓存"
            Write-Host ""
            Write-Host "环境变量:"
            Write-Host "  `$env:MIHOMO_MIRROR='https://mirror.example.com'  设置 mihomo 下载镜像"
            Write-Host ""
        }
    }
}
finally {
    Pop-Location
}
