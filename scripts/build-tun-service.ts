/**
 * Build Windows `tun-service.exe` for Tauri externalBin.
 *
 * Usage:
 *   pnpm build-tun
 *   AURESTREAM_RUST_TARGET=x86_64-pc-windows-msvc pnpm build-tun
 *
 * Output:
 *   src-tauri/binaries/tun-service-<triple>.exe
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "src-tauri", "binaries");

const target =
  process.env.AURESTREAM_RUST_TARGET?.trim() ||
  (process.platform === "win32"
    ? process.arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc"
    : "x86_64-pc-windows-msvc");

if (!target.includes("windows")) {
  console.log(`skip build-tun: target ${target} is not Windows`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

console.log(`Building tun-service for ${target}...`);
execSync(
  `cargo build -p aurestream-platform-tun --bin tun-service --release --target ${target}`,
  { cwd: root, stdio: "inherit" },
);

const built = path.join(
  root,
  "target",
  target,
  "release",
  "tun-service.exe",
);
const dest = path.join(outDir, `tun-service-${target}.exe`);
if (!fs.existsSync(built)) {
  console.error(`built binary missing: ${built}`);
  process.exit(1);
}
fs.copyFileSync(built, dest);
// Also plain name for local resolve helpers.
fs.copyFileSync(built, path.join(outDir, "tun-service.exe"));
console.log(`OK -> ${dest}`);
