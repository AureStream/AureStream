#!/usr/bin/env tsx
/**
 * Sync SMPrivilegedExecutables / SMAuthorizedClients with actual codesign
 * designated requirements. Required for Developer ID SMJobBless; ad-hoc builds
 * can keep the simple identifier "..." strings in the plists.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-smjobbless-reqs.ts path/to/aurestream.app
 *
 * After updating helper/Info.plist, rerun `pnpm pre-bundle` and rebuild the app.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function designatedRequirement(binaryPath: string): string {
  const result = spawnSync("codesign", ["-d", "-r-", "--quiet", binaryPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `codesign -d -r- failed for ${binaryPath}: ${result.stderr || result.stdout}`
    );
  }
  const line = (result.stdout || "").trim();
  const prefix = "designated => ";
  if (!line.startsWith(prefix)) {
    throw new Error(`Unexpected codesign output for ${binaryPath}: ${line}`);
  }
  return line.slice(prefix.length).trim();
}

function setPlistString(
  plistPath: string,
  key: string,
  dictKey: string,
  value: string
): boolean {
  const xml = readFileSync(plistPath, "utf8");
  const keyBlock = `<key>${key}</key>`;
  const start = xml.indexOf(keyBlock);
  if (start < 0) {
    throw new Error(`${key} missing in ${plistPath}`);
  }
  const dictOpen = xml.indexOf("<dict>", start);
  const dictClose = xml.indexOf("</dict>", dictOpen);
  const entryKey = `<key>${dictKey}</key>`;
  const entryStart = xml.indexOf(entryKey, dictOpen);
  if (entryStart < 0 || entryStart > dictClose) {
    throw new Error(`${dictKey} missing under ${key} in ${plistPath}`);
  }
  const stringOpen = xml.indexOf("<string>", entryStart);
  const stringClose = xml.indexOf("</string>", stringOpen);
  const before = xml.slice(0, stringOpen + "<string>".length);
  const after = xml.slice(stringClose);
  const next = `${before}${value}${after}`;
  if (next === xml) {
    return false;
  }
  writeFileSync(plistPath, next);
  return true;
}

function setAuthorizedClient(plistPath: string, value: string): boolean {
  const xml = readFileSync(plistPath, "utf8");
  const keyBlock = "<key>SMAuthorizedClients</key>";
  const start = xml.indexOf(keyBlock);
  if (start < 0) {
    throw new Error(`SMAuthorizedClients missing in ${plistPath}`);
  }
  const stringOpen = xml.indexOf("<string>", start);
  const stringClose = xml.indexOf("</string>", stringOpen);
  const before = xml.slice(0, stringOpen + "<string>".length);
  const after = xml.slice(stringClose);
  const next = `${before}${value}${after}`;
  if (next === xml) {
    return false;
  }
  writeFileSync(plistPath, next);
  return true;
}

const appPath = process.argv[2];
if (!appPath) {
  console.error("Usage: tsx scripts/sync-smjobbless-reqs.ts path/to/aurestream.app");
  process.exit(1);
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const appExec = join(appPath, "Contents/MacOS/aurestream");
const helperInApp = join(
  appPath,
  "Contents/Library/LaunchServices/com.root.aurestream.helper"
);
const appInfoPlist = join(repoRoot, "src-tauri/Info.privileged-helper.plist");
const helperInfoPlist = join(repoRoot, "src-tauri/helper/Info.plist");

const appReq = designatedRequirement(appExec);
const helperReq = designatedRequirement(helperInApp);

console.log("[sync-smjobbless] app designated requirement:");
console.log(`  ${appReq}`);
console.log("[sync-smjobbless] helper designated requirement:");
console.log(`  ${helperReq}`);

const appPlistChanged = setPlistString(
  appInfoPlist,
  "SMPrivilegedExecutables",
  "com.root.aurestream.helper",
  helperReq
);
const helperPlistChanged = setAuthorizedClient(helperInfoPlist, appReq);

if (appPlistChanged) {
  console.log(`[sync-smjobbless] updated ${appInfoPlist}`);
}
if (helperPlistChanged) {
  console.log(`[sync-smjobbless] updated ${helperInfoPlist}`);
  console.log("[sync-smjobbless] helper Info.plist changed — rerun: pnpm pre-bundle && pnpm tauri build");
}

if (!appPlistChanged && !helperPlistChanged) {
  console.log("[sync-smjobbless] plists already match signed binaries");
}
