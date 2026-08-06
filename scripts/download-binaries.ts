import fs, { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import unzipper from 'unzipper';
import { XRAY_VERSION } from '../src/types/definition';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BINARY_NAME = 'xray';
const GITHUB_RELEASE_URL = 'https://github.com/XTLS/Xray-core/releases/download/';
/** Official Wintun release (Xray Windows TUN loads wintun.dll next to the core). */
const WINTUN_VERSION = '0.14.1';
const WINTUN_ZIP_URL = `https://www.wintun.net/builds/wintun-${WINTUN_VERSION}.zip`;

// Xray-core release assets always ship as a zip, on every platform, and extract
// flat at the archive root (no versioned subdirectory) — e.g.
// `Xray-macos-arm64-v8a.zip` contains `xray`, `geoip.dat`, `geosite.dat`, …
//
// Sidecar is staged as `aurestream-core-<rust-target-triple>` for Tauri
// `externalBin` + engine `resolve_sidecar_path`.
//
// Wintun is staged for Windows TUN (Xray loads wintun.dll next to core).
const RUST_TARGET_TRIPLES = {
    "darwin": {
        "arm64": { targetTriple: "aarch64-apple-darwin", assetSuffix: "macos-arm64-v8a" },
        "amd64": { targetTriple: "x86_64-apple-darwin", assetSuffix: "macos-64" }
    },
    "linux": {
        "amd64": { targetTriple: "x86_64-unknown-linux-gnu", assetSuffix: "linux-64" },
        "arm64": { targetTriple: "aarch64-unknown-linux-gnu", assetSuffix: "linux-arm64-v8a" }
    },
    "windows": {
        "amd64": { targetTriple: "x86_64-pc-windows-msvc", assetSuffix: "windows-64" },
        "arm64": { targetTriple: "aarch64-pc-windows-msvc", assetSuffix: "windows-arm64-v8a" },
    }
} as const;

type Platform = keyof typeof RUST_TARGET_TRIPLES;
type Architecture = keyof typeof RUST_TARGET_TRIPLES[Platform];

async function downloadFile(url: string, dest: string, maxRetries: number = 3): Promise<void> {
    const streamPipeline = promisify(pipeline);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(url, {
                signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            if (!response.ok) {
                throw new Error(`Download failed: '${url}' (${response.status})`);
            }

            if (!response.body) {
                throw new Error('Response body is empty');
            }

            await streamPipeline(response.body as any, createWriteStream(dest));
            return;
        } catch (error) {
            lastError = error as Error;

            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }

            if (attempt < maxRetries) {
                const waitTime = attempt * 1000;
                console.warn(`Download attempt ${attempt} failed for '${url}': ${lastError.message}. Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw new Error(`Download failed after ${maxRetries} attempts: '${url}'. Last error: ${lastError?.message}`);
}

async function extractZip(filePath: string, tmpDir: string): Promise<void> {
    await fs.createReadStream(filePath).pipe(unzipper.Extract({ path: tmpDir })).promise();
}

/** First platform/arch processed writes geoip.dat/geosite.dat (identical across platforms). */
let geoDataSaved = false;

async function embeddingExternalBinaries(
    platform: Platform,
    arch: Architecture,
    extension: string,
    target: typeof RUST_TARGET_TRIPLES[Platform][Architecture]
): Promise<void> {
    const startTime = Date.now();
    const { targetTriple, assetSuffix } = target;
    const fileName = `Xray-${assetSuffix}.zip`;
    const downloadUrl = `${GITHUB_RELEASE_URL}${XRAY_VERSION}/${fileName}`;
    const tmpDir = path.join(__dirname, 'tmp', `${platform}-${arch}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    const downloadPath = path.join(tmpDir, fileName);

    try {
        !fs.existsSync(tmpDir) && fs.mkdirSync(tmpDir, { recursive: true });

        console.log(`Downloading Xray-core ${platform}-${arch}-${XRAY_VERSION}...`);
        await downloadFile(downloadUrl, downloadPath);
        await extractZip(downloadPath, tmpDir);

        const extractedFilePath = path.join(tmpDir, `${BINARY_NAME}${extension}`);
        const targetPath = `src-tauri/binaries/aurestream-core-${targetTriple}${extension}`;

        const targetDir = path.dirname(targetPath);
        !fs.existsSync(targetDir) && fs.mkdirSync(targetDir, { recursive: true });

        fs.renameSync(extractedFilePath, targetPath);

        // unzipper does not restore the Unix executable bit from zip permissions.
        if (platform !== 'windows') {
            fs.chmodSync(targetPath, 0o755);
        }

        const resourcesDir = 'src-tauri/resources';
        !fs.existsSync(resourcesDir) && fs.mkdirSync(resourcesDir, { recursive: true });
        if (!geoDataSaved) {
            geoDataSaved = true;
            for (const geoFile of ['geoip.dat', 'geosite.dat']) {
                const src = path.join(tmpDir, geoFile);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(resourcesDir, geoFile));
                }
            }
        }

        // Stage wintun.dll for Windows TUN (from Xray zip if present, else official Wintun).
        if (platform === 'windows') {
            await stageWintunDll(arch as Architecture, tmpDir, resourcesDir, targetDir);
        }

        fs.rmSync(tmpDir, { recursive: true, force: true });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`${platform}-${arch} version processed successfully (${elapsed}s)`);
    } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error(`Processing failed after ${elapsed}s:`, error);
        throw error;
    }
}

async function stageWintunDll(
    arch: Architecture,
    xrayTmpDir: string,
    resourcesDir: string,
    coreDir: string,
): Promise<void> {
    const archDir = arch === 'arm64' ? 'arm64' : 'amd64';
    const candidates = [
        path.join(xrayTmpDir, 'wintun.dll'),
        path.join(xrayTmpDir, 'wintun', 'bin', archDir, 'wintun.dll'),
        path.join(resourcesDir, 'wintun.dll'),
    ];
    let found: string | null = null;
    for (const full of candidates) {
        if (fs.existsSync(full)) {
            found = full;
            break;
        }
    }

    if (!found) {
        const wintunTmp = path.join(__dirname, 'tmp', `wintun-${WINTUN_VERSION}-${Date.now()}`);
        fs.mkdirSync(wintunTmp, { recursive: true });
        const zipPath = path.join(wintunTmp, 'wintun.zip');
        console.log(`Downloading Wintun ${WINTUN_VERSION}...`);
        try {
            await downloadFile(WINTUN_ZIP_URL, zipPath);
            await extractZip(zipPath, wintunTmp);
            const fromZip = path.join(wintunTmp, 'wintun', 'bin', archDir, 'wintun.dll');
            if (fs.existsSync(fromZip)) {
                found = fromZip;
            }
        } catch (e) {
            console.warn(`Wintun download failed: ${(e as Error).message}`);
        } finally {
            // keep found path until after copy
        }
        if (found) {
            // copy out then clean
            const staged = path.join(resourcesDir, 'wintun.dll');
            fs.copyFileSync(found, staged);
            fs.copyFileSync(found, path.join(coreDir, 'wintun.dll'));
            fs.rmSync(wintunTmp, { recursive: true, force: true });
            console.log('staged wintun.dll (official release)');
            return;
        }
        fs.rmSync(wintunTmp, { recursive: true, force: true });
        console.warn('wintun.dll unavailable — Windows TUN will not work until it is staged');
        return;
    }

    fs.copyFileSync(found, path.join(resourcesDir, 'wintun.dll'));
    fs.copyFileSync(found, path.join(coreDir, 'wintun.dll'));
    console.log('staged wintun.dll');
}

function parseTargetFilter(argv: string[]): string | undefined {
    const envTarget = process.env.AURESTREAM_RUST_TARGET?.trim();
    if (envTarget) {
        return envTarget;
    }
    const idx = argv.indexOf('--target');
    if (idx >= 0 && argv[idx + 1]) {
        return argv[idx + 1].trim();
    }
    const eq = argv.find((a) => a.startsWith('--target='));
    return eq ? eq.slice('--target='.length).trim() : undefined;
}

function knownTargetTriples(): Set<string> {
    const triples = new Set<string>();
    for (const archs of Object.values(RUST_TARGET_TRIPLES)) {
        for (const target of Object.values(archs)) {
            triples.add(target.targetTriple);
        }
    }
    return triples;
}

async function downloadEmbeddingExternalBinaries(targetFilter?: string): Promise<void> {
    if (targetFilter && !knownTargetTriples().has(targetFilter)) {
        throw new Error(
            `Unknown rust target '${targetFilter}'. Expected one of: ${[...knownTargetTriples()].join(', ')}`
        );
    }

    const downloadTasks: Promise<void>[] = [];

    for (const [platform, archs] of Object.entries(RUST_TARGET_TRIPLES)) {
        for (const [arch, target] of Object.entries(archs)) {
            if (targetFilter && target.targetTriple !== targetFilter) {
                continue;
            }
            const extension = platform === 'windows' ? '.exe' : '';
            downloadTasks.push(
                embeddingExternalBinaries(
                    platform as Platform,
                    arch as Architecture,
                    extension,
                    target
                )
            );
        }
    }

    if (downloadTasks.length === 0) {
        throw new Error('No download tasks selected');
    }

    await Promise.all(downloadTasks);
}

{
    const scriptStartTime = Date.now();
    const targetFilter = parseTargetFilter(process.argv.slice(2));
    console.log(
        targetFilter
            ? `Starting Xray-core download for ${targetFilter} (MVP: no TUN assets)...\n`
            : 'Starting Xray-core downloads for all targets (MVP: no TUN assets)...\n'
    );

    downloadEmbeddingExternalBinaries(targetFilter).then(() => {
        const totalElapsed = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
        console.log(`\n✓ All downloads completed! Total time: ${totalElapsed}s`);
        process.exit(0);
    }).catch((error) => {
        const totalElapsed = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
        console.error(`\n✗ Download failed after ${totalElapsed}s:`, error);
        process.exit(1);
    });
}
