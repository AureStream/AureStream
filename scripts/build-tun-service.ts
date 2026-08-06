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

// Respect CI / tauri CARGO_TARGET_DIR (e.g. src-tauri/target on GitHub Actions).
const cargoTargetDir = process.env.CARGO_TARGET_DIR?.trim()
  ? path.resolve(process.env.CARGO_TARGET_DIR.trim())
  : path.join(root, "target");

console.log(`Building tun-service for ${target} (CARGO_TARGET_DIR=${cargoTargetDir})...`);
execSync(
  `cargo build -p aurestream-platform-tun --bin tun-service --release --target ${target}`,
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_TARGET_DIR: cargoTargetDir,
    },
  },
);

const candidates = [
  path.join(cargoTargetDir, target, "release", "tun-service.exe"),
  // Host triple build without --target layout (unlikely for windows-msvc on CI).
  path.join(cargoTargetDir, "release", "tun-service.exe"),
  path.join(root, "target", target, "release", "tun-service.exe"),
  path.join(root, "src-tauri", "target", target, "release", "tun-service.exe"),
];

const built = candidates.find((p) => fs.existsSync(p));
const dest = path.join(outDir, `tun-service-${target}.exe`);
if (!built) {
  console.error("built binary missing; searched:");
  for (const p of candidates) console.error(`  - ${p}`);
  process.exit(1);
}
fs.copyFileSync(built, dest);
// Also plain name for local resolve helpers.
fs.copyFileSync(built, path.join(outDir, "tun-service.exe"));
console.log(`OK ${built} -> ${dest}`);
