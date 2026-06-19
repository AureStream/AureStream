#!/usr/bin/env node
/**
 * Build and launch AureStream for local TUN mode testing.
 *
 * macOS  — release .app + ad-hoc sign + open (tauri dev cannot SMJobBless)
 * Windows — build-tun + tauri dev (UAC installs SCM service on first TUN switch)
 * Linux  — tauri build + print deb/appimage paths (helper must be installed via package)
 *
 * Usage:
 *   pnpm test:tun
 *   pnpm test:tun -- --build-only
 *   pnpm test:tun -- --skip-download
 *   pnpm test:tun -- --release        Windows: tauri build + run .exe instead of dev
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const srcTauri = join(repoRoot, "src-tauri");
const PRODUCT = "AureStream";

const args = process.argv.slice(2);
const buildOnly = args.includes("--build-only");
const skipDownload = args.includes("--skip-download");
const release = args.includes("--release");

if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: pnpm test:tun [-- --build-only] [-- --skip-download] [-- --release]

  --build-only      Build/sign only; do not launch the app
  --skip-download   Skip pnpm download-binaries
  --release         Windows: full release build instead of tauri dev
  -h, --help        Show this help`);
    process.exit(0);
}

function run(cmd: string, cmdArgs: string[], cwd = repoRoot): void {
    console.log(`\n[test:tun] ${cmd} ${cmdArgs.join(" ")}`);
    const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: true });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function pnpm(script: string, extraArgs: string[] = []): void {
    run("pnpm", [script, ...extraArgs]);
}

function macAppCandidates(): string[] {
    return [
        join(srcTauri, "target", "release", "bundle", "macos", `${PRODUCT}.app`),
        join(repoRoot, "target", "release", "bundle", "macos", `${PRODUCT}.app`),
    ];
}

function resolveMacAppPath(): string {
    for (const candidate of macAppCandidates()) {
        if (existsSync(candidate)) return candidate;
    }
    return macAppCandidates()[0];
}

const LOCAL_TAURI_CONFIG = "src-tauri/tauri.local.conf.json";

function tauriBuildArgs(): string[] {
    return ["build", "--config", LOCAL_TAURI_CONFIG];
}

function findFileRecursive(dir: string, predicate: (name: string) => boolean): string | null {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = findFileRecursive(full, predicate);
            if (nested) return nested;
        } else if (predicate(entry.name)) {
            return full;
        }
    }
    return null;
}

function ensureBinaries(): void {
    if (skipDownload) return;
    pnpm("download-binaries");
}

function testTunMacOS(): void {
    pnpm("build");
    pnpm("tauri", tauriBuildArgs());

    const app = resolveMacAppPath();
    if (!existsSync(app)) {
        console.error(`[test:tun] .app not found. Checked:\n  ${macAppCandidates().join("\n  ")}`);
        process.exit(1);
    }

    run("bash", ["scripts/sign-macos-bundle.sh", app]);

    if (buildOnly) {
        console.log(`\n[test:tun] Ready: ${app}`);
        return;
    }

    run("open", [app]);
    console.log(
        "\n[test:tun] Launched AureStream.\n" +
            "  1. Switch to TUN mode on the home page\n" +
            "  2. Install the privileged helper when prompted (admin password)\n" +
            "  3. Connect with a valid subscription/node",
    );
}

function testTunWindows(): void {
    pnpm("build-tun", release ? ["--release"] : []);

    if (buildOnly) {
        console.log("\n[test:tun] Windows TUN service binary built.");
        return;
    }

    if (release) {
        pnpm("build");
        pnpm("tauri", tauriBuildArgs());
        const exe =
            findFileRecursive(join(srcTauri, "target", "release"), (n) =>
                n.toLowerCase().endsWith(`${PRODUCT.toLowerCase()}.exe`),
            ) ?? join(srcTauri, "target", "release", `${PRODUCT}.exe`);
        if (!existsSync(exe)) {
            console.error(`[test:tun] executable not found: ${exe}`);
            process.exit(1);
        }
        run("cmd", ["/c", "start", "", exe]);
        console.log(
            "\n[test:tun] Launched AureStream (release).\n" +
                "  Switch to TUN mode — UAC will install AureStreamTunService on first use.",
        );
        return;
    }

    pnpm("tauri", ["dev"]);
}

function testTunLinux(): void {
    pnpm("build");
    pnpm("tauri", tauriBuildArgs());

    const bundleRoot = join(srcTauri, "target", "release", "bundle");
    const deb = findFileRecursive(join(bundleRoot, "deb"), (n) => n.endsWith(".deb"));
    const appImage = findFileRecursive(join(bundleRoot, "appimage"), (n) =>
        n.endsWith(".AppImage"),
    );

    console.log("\n[test:tun] Linux TUN requires the packaged helper (polkit + tun-helper).");
    if (deb) console.log(`  deb:        sudo dpkg -i ${deb}`);
    if (appImage) console.log(`  AppImage:   ${appImage}`);
    if (!deb && !appImage) console.log(`  bundles:    ${bundleRoot}`);

    if (buildOnly) return;

    if (appImage && existsSync(appImage)) {
        run(appImage, []);
        console.log("\n[test:tun] Launched AppImage. Install .deb first if TUN helper is missing.");
        return;
    }

    console.log("\n[test:tun] Install the .deb package, then launch AureStream and switch to TUN mode.");
}

function main(): void {
    console.log(`[test:tun] platform=${process.platform} buildOnly=${buildOnly} release=${release}`);
    ensureBinaries();

    switch (process.platform) {
        case "darwin":
            testTunMacOS();
            break;
        case "win32":
            testTunWindows();
            break;
        default:
            testTunLinux();
            break;
    }
}

main();
