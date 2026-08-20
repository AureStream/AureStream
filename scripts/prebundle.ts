#!/usr/bin/env node
/**
 * Build and sign the macOS privileged helper (SMJobBless).
 *
 * Usage:
 *   pnpm pre-bundle
 *   pnpm pre-bundle "Developer ID Application: …"
 *
 * Output:
 *   src-tauri/target/helper/com.root.aurestream.helper
 *
 * Skips on non-macOS hosts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.log("[prebundle] macOS helper only needed on macOS hosts, skipping");
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const srcTauri = join(repoRoot, "src-tauri");
const helperDir = join(
  repoRoot,
  "crates",
  "aurestream-platform-tun",
  "macos-helper",
);
const buildDir = join(srcTauri, "target", "helper");
const label = "com.root.aurestream.helper";

// SECURITY: off by default. Only set AURESTREAM_DEV_UNSIGNED_HELPER=1 for
// local dev testing against unsigned/ad-hoc builds — it compiles in a
// fallback that trusts a caller-controlled Info.plist bundle id instead of
// a verified code signature. Never set this for a helper build that will be
// installed, distributed, or run against a real user's system.
const allowUnsignedHelperClients = process.env.AURESTREAM_DEV_UNSIGNED_HELPER === "1";
if (allowUnsignedHelperClients) {
  console.warn(
    "[prebundle] WARNING: AURESTREAM_DEV_UNSIGNED_HELPER=1 — building a helper " +
      "that accepts unsigned/spoofable clients via Info.plist bundle-id fallback. " +
      "This is a local-privilege-escalation surface. DEV BUILDS ONLY — this " +
      "binary must never be distributed or installed on a real user's machine.",
  );
}

const clangCheck = spawnSync("clang", ["--version"]);
if (clangCheck.status !== 0) {
  console.error(
    "[prebundle] clang not found — install Xcode Command Line Tools",
  );
  process.exit(1);
}

if (!existsSync(join(helperDir, "Sources", "main.m"))) {
  console.error(`[prebundle] helper sources missing under ${helperDir}`);
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });

const mainSource = join(helperDir, "Sources", "main.m");
const infoPlist = join(helperDir, "Info.plist");
const launchdPlist = join(helperDir, "Launchd.plist");
const finalOut = join(buildDir, label);

const buildSlice = (arch: string, target: string): string => {
  const out = join(buildDir, `${label}.${arch}`);
  console.log(`[prebundle] Compiling slice for ${arch} (${target})...`);
  const clangArgs = [
    "-target",
    target,
    "-O2",
    "-fobjc-arc",
    "-Wall",
    "-Wextra",
    "-framework",
    "Foundation",
    "-framework",
    "CoreServices",
    "-framework",
    "Security",
    "-lbsm",
    "-Xlinker",
    "-sectcreate",
    "-Xlinker",
    "__TEXT",
    "-Xlinker",
    "__info_plist",
    "-Xlinker",
    infoPlist,
    "-Xlinker",
    "-sectcreate",
    "-Xlinker",
    "__TEXT",
    "-Xlinker",
    "__launchd_plist",
    "-Xlinker",
    launchdPlist,
  ];
  if (allowUnsignedHelperClients) {
    clangArgs.push("-DAURESTREAM_ALLOW_UNSIGNED_HELPER_CLIENTS=1");
  }
  clangArgs.push(mainSource, "-o", out);
  const result = spawnSync("clang", clangArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[prebundle] Failed to compile ${arch} slice`);
    process.exit(result.status ?? 1);
  }
  return out;
};

const x86Path = buildSlice("x86_64", "x86_64-apple-macos10.15");
const armPath = buildSlice("arm64", "arm64-apple-macos11.0");

console.log("[prebundle] Creating universal binary using lipo...");
const lipoResult = spawnSync(
  "lipo",
  ["-create", x86Path, armPath, "-output", finalOut],
  { stdio: "inherit" },
);
if (lipoResult.status !== 0) {
  console.error("[prebundle] lipo failed");
  process.exit(lipoResult.status ?? 1);
}
try {
  unlinkSync(x86Path);
  unlinkSync(armPath);
} catch {
  /* ignore */
}

const otoolInfo = spawnSync(
  "otool",
  ["-s", "__TEXT", "__info_plist", finalOut],
  { encoding: "utf8" },
);
const otoolLaunchd = spawnSync(
  "otool",
  ["-s", "__TEXT", "__launchd_plist", finalOut],
  { encoding: "utf8" },
);
if (
  !otoolInfo.stdout?.includes("Contents of") ||
  !otoolLaunchd.stdout?.includes("Contents of")
) {
  console.error("[prebundle] Required plist sections missing from helper binary");
  process.exit(1);
}
console.log("[prebundle] Verified embedded plist sections");

const signingIdentity =
  process.argv[2] || process.env.APPLE_SIGNING_IDENTITY?.trim() || "-";
console.log(`[prebundle] Signing helper with identity: "${signingIdentity}"...`);
const codesignArgs = [
  "--force",
  "--sign",
  signingIdentity,
  "--identifier",
  label,
];
if (signingIdentity !== "-") {
  codesignArgs.push("--options", "runtime", "--timestamp");
}
codesignArgs.push(finalOut);
const codesignResult = spawnSync("codesign", codesignArgs, { stdio: "inherit" });
if (codesignResult.status !== 0) {
  console.error("[prebundle] Codesign failed");
  process.exit(codesignResult.status ?? 1);
}
const verifyResult = spawnSync(
  "codesign",
  ["--verify", "--verbose=2", finalOut],
  { stdio: "inherit" },
);
if (verifyResult.status !== 0) {
  console.error("[prebundle] Signature verification failed");
  process.exit(verifyResult.status ?? 1);
}

console.log(`[prebundle] OK -> ${finalOut}`);
