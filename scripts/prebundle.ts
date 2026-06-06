#!/usr/bin/env node
/**
 * Build and sign the macOS privileged helper.
 * Replaces prebundle.sh, build-helper.sh, and sign-helper.sh to use uniform pnpm/Node tooling.
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
const helperDir = join(srcTauri, "helper");
const buildDir = join(srcTauri, "target", "helper");
const label = "com.root.aurestream.helper";

// Verify clang is available
const clangCheck = spawnSync("clang", ["--version"]);
if (clangCheck.status !== 0) {
    console.error("[prebundle] clang not found — please install Xcode Command Line Tools");
    process.exit(1);
}

// Ensure build directory exists
mkdirSync(buildDir, { recursive: true });

const mainSource = join(helperDir, "Sources", "main.m");
const infoPlist = join(helperDir, "Info.plist");
const launchdPlist = join(helperDir, "Launchd.plist");
const finalOut = join(buildDir, label);

const buildSlice = (arch: string, target: string): string => {
    const out = join(buildDir, `${label}.${arch}`);
    console.log(`[prebundle] Compiling slice for ${arch} (${target})...`);
    
    const clangArgs = [
        "-target", target,
        "-O2",
        "-fobjc-arc",
        "-Wall", "-Wextra",
        "-framework", "Foundation",
        "-framework", "Security",
        "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", infoPlist,
        "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__launchd_plist", "-Xlinker", launchdPlist,
        mainSource,
        "-o", out
    ];

    const result = spawnSync("clang", clangArgs, { stdio: "inherit" });
    if (result.status !== 0) {
        console.error(`[prebundle] Failed to compile ${arch} slice`);
        process.exit(result.status ?? 1);
    }
    return out;
};

// 1. Build universal slices
const x86Path = buildSlice("x86_64", "x86_64-apple-macos10.15");
const armPath = buildSlice("arm64", "arm64-apple-macos11.0");

// 2. Combine into a universal binary using lipo
console.log("[prebundle] Creating universal binary using lipo...");
const lipoArgs = ["-create", x86Path, armPath, "-output", finalOut];
const lipoResult = spawnSync("lipo", lipoArgs, { stdio: "inherit" });
if (lipoResult.status !== 0) {
    console.error("[prebundle] lipo failed to create universal binary");
    process.exit(lipoResult.status ?? 1);
}

// Clean up slice files
try {
    unlinkSync(x86Path);
    unlinkSync(armPath);
} catch (e) {
    console.warn("[prebundle] Failed to clean up slice files:", e);
}

// 3. Verify sections are embedded
const otoolInfo = spawnSync("otool", ["-s", "__TEXT", "__info_plist", finalOut], { encoding: "utf8" });
const otoolLaunchd = spawnSync("otool", ["-s", "__TEXT", "__launchd_plist", finalOut], { encoding: "utf8" });

if (!otoolInfo.stdout.includes("Contents of") || !otoolLaunchd.stdout.includes("Contents of")) {
    console.error("[prebundle] Error: Required plist sections missing from helper binary");
    process.exit(1);
}
console.log("[prebundle] Verified embedded plist sections successfully");

// 4. Code signing (read from command line arguments or default to ad-hoc "-")
const signingIdentity =
    process.argv[2] || process.env.APPLE_SIGNING_IDENTITY || "-";
console.log(`[prebundle] Signing helper with identity: "${signingIdentity}"...`);

const codesignArgs = [
    "--force",
    "--sign", signingIdentity,
    "--identifier", label,
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

// Verify signature
const verifyResult = spawnSync("codesign", ["--verify", "--verbose=2", finalOut], { stdio: "inherit" });
if (verifyResult.status !== 0) {
    console.error("[prebundle] Signature verification failed");
    process.exit(verifyResult.status ?? 1);
}

console.log("[prebundle] Built and signed macOS helper successfully!");
