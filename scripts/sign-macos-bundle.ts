/**
 * Ad-hoc (or Developer ID) sign a built AureStream.app so SMJobBless works.
 *
 * Root cause of CFErrorDomainLaunchd error 4 on local builds:
 *   - tauri/cargo often leaves the main binary *linker-signed* with a random
 *     identifier (e.g. aurestream-667404ea…), Info.plist not bound
 *   - helper SMAuthorizedClients requires: identifier "com.root.aurestream"
 *   - SMJobBless rejects the client → error 4
 *   - non-Mach-O files (geoip.dat / geosite.dat) under Contents/MacOS also
 *     break codesign of the main binary
 *
 * Usage:
 *   pnpm sign-macos-bundle /Applications/AureStream.app
 *   pnpm sign-macos-bundle path/to/AureStream.app "Developer ID Application: …"
 *
 * Identity defaults to ad-hoc "-" (or $APPLE_SIGNING_IDENTITY).
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";

const appPath = resolve(process.argv[2] || "");
const identity =
  process.argv[3]?.trim() ||
  process.env.APPLE_SIGNING_IDENTITY?.trim() ||
  "-";

if (!appPath || !existsSync(appPath)) {
  console.error(
    "Usage: pnpm sign-macos-bundle /path/to/AureStream.app [signing-identity]",
  );
  process.exit(1);
}

const HELPER_ID = "com.root.aurestream.helper";
const APP_ID = "com.root.aurestream";
const helperPath = join(
  appPath,
  "Contents/Library/LaunchServices",
  HELPER_ID,
);
const macosDir = join(appPath, "Contents/MacOS");
const mainBin = join(macosDir, "aurestream");
const coreBin = join(macosDir, "aurestream-core");
const resourcesGeo = join(appPath, "Contents/Resources/resources");

function run(cmd: string, args: string[], fatal = true): boolean {
  console.log(
    `$ ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
  );
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    if (fatal) {
      console.error(`[sign-macos-bundle] failed (${r.status})`);
      process.exit(r.status ?? 1);
    }
    return false;
  }
  return true;
}

function codesign(target: string, identifier: string, extra: string[] = []) {
  // --identifier is what SMJobBless matches against SMAuthorizedClients /
  // SMPrivilegedExecutables (`identifier "com.root.aurestream"`).
  const args = [
    "--force",
    "--sign",
    identity,
    "--identifier",
    identifier,
    ...extra,
  ];
  if (identity !== "-") {
    args.push("--options", "runtime", "--timestamp");
  }
  args.push(target);
  run("codesign", args);
}

/**
 * geo*.dat next to the main binary makes `codesign` treat MacOS/ as a bundle
 * and fail. Move them under Resources/resources (engine already looks there).
 */
function relocateNonMachOFromMacOS() {
  if (!existsSync(macosDir)) return;
  mkdirSync(resourcesGeo, { recursive: true });
  for (const name of readdirSync(macosDir)) {
    if (name === "aurestream" || name === "aurestream-core") continue;
    const src = join(macosDir, name);
    let st;
    try {
      st = statSync(src);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    // Keep only executables in MacOS.
    const isExec = (st.mode & 0o111) !== 0 && !name.endsWith(".dat");
    if (isExec && !name.includes(".")) continue;
    if (!name.endsWith(".dat") && !name.endsWith(".json") && isExec) continue;
    const dst = join(resourcesGeo, name);
    console.log(`[sign-macos-bundle] relocate ${name} → Resources/resources/`);
    try {
      renameSync(src, dst);
    } catch {
      copyFileSync(src, dst);
      try {
        // best-effort remove original
        spawnSync("rm", ["-f", src]);
      } catch {
        /* ignore */
      }
    }
  }
}

console.log(`[sign-macos-bundle] app=${appPath}`);
console.log(`[sign-macos-bundle] identity=${JSON.stringify(identity)}`);

relocateNonMachOFromMacOS();

// Inside-out: nested tools first, then main binary, then bundle (no --deep on
// the .app so the helper keeps its own identifier).
if (existsSync(helperPath)) {
  codesign(helperPath, HELPER_ID);
} else {
  console.warn(
    `[sign-macos-bundle] WARNING: helper missing at ${helperPath} (TUN/SMJobBless will fail)`,
  );
}

if (existsSync(coreBin)) {
  codesign(coreBin, APP_ID);
}

if (!existsSync(mainBin)) {
  console.error(`[sign-macos-bundle] main binary missing: ${mainBin}`);
  process.exit(1);
}
codesign(mainBin, APP_ID);

// Bundle signature binds Info.plist (CFBundleIdentifier com.root.aurestream).
codesign(appPath, APP_ID);

console.log("\n[sign-macos-bundle] verify:");
run("codesign", ["-dv", "--verbose=2", appPath], false);
run("codesign", ["-d", "-r-", appPath], false);
if (existsSync(helperPath)) {
  run("codesign", ["-dv", "--verbose=2", helperPath], false);
  run("codesign", ["-d", "-r-", helperPath], false);
}
run("codesign", ["--verify", "--verbose=2", appPath], false);

const idOut = spawnSync("codesign", ["-dv", appPath], { encoding: "utf8" });
const idText = `${idOut.stdout || ""}${idOut.stderr || ""}`;
if (!idText.includes(`Identifier=${APP_ID}`)) {
  console.error(
    `[sign-macos-bundle] FAIL: expected Identifier=${APP_ID}, got:\n${idText}`,
  );
  process.exit(2);
}

console.log(
  `[sign-macos-bundle] OK — app Identifier=${APP_ID} (matches helper SMAuthorizedClients)`,
);
console.log(`
Next:
  1. Quit AureStream completely (menu bar too)
  2. Re-open ${appPath}
  3. Enable TUN — macOS should prompt once for helper install
  4. If it still fails: 我的 → 卸载虚拟网卡组件, then retry TUN
`);
