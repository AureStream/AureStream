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

// Xray-core release assets always ship as a zip, on every platform (unlike
// sing-box's tar.gz-for-unix/zip-for-windows split), and extract flat at the
// archive root (no versioned subdirectory) — e.g. `Xray-macos-arm64-v8a.zip`
// contains `xray`, `geoip.dat`, `geosite.dat`, `LICENSE`, `README.md`
// directly, not `Xray-v26.3.27-macos-arm64-v8a/xray`.
//
// Supported target architecture mapping: Rust target triple -> Xray asset
// platform/arch component (verified against the real release asset list via
// `gh api repos/XTLS/Xray-core/releases/latest`).
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
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

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
            return; // Success, exit function
        } catch (error) {
            lastError = error as Error;

            // Clean up partial download if it exists
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }

            if (attempt < maxRetries) {
                const waitTime = attempt * 1000; // Progressive delay: 1s, 2s, 3s
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

/** First platform/arch processed writes geoip.dat/geosite.dat (identical
 *  content across platforms — no point downloading twice-per-arch). */
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
    // 为每个任务创建唯一的临时目录
    const tmpDir = path.join(__dirname, 'tmp', `${platform}-${arch}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    const downloadPath = path.join(tmpDir, fileName);

    try {
        // Create temporary directory
        !fs.existsSync(tmpDir) && fs.mkdirSync(tmpDir, { recursive: true });

        // Download and extract file
        console.log(`Downloading Xray-core ${platform}-${arch}-${XRAY_VERSION}...`);
        await downloadFile(downloadUrl, downloadPath);
        await extractZip(downloadPath, tmpDir);

        // Move binary to target location (flat extraction, no version subdir)
        const extractedFilePath = path.join(tmpDir, `${BINARY_NAME}${extension}`);
        const targetPath = `src-tauri/binaries/aurestream-core-${targetTriple}${extension}`;

        // Ensure target directory exists
        const targetDir = path.dirname(targetPath);
        !fs.existsSync(targetDir) && fs.mkdirSync(targetDir, { recursive: true });

        // Move file and cleanup
        fs.renameSync(extractedFilePath, targetPath);

        // unzipper doesn't restore the Unix executable bit from the zip's
        // stored permissions (unlike tar, which the old sing-box script used
        // for unix platforms specifically to avoid this) — every Xray-core
        // release asset is a zip, on every platform, so this is needed here.
        if (platform !== 'windows') {
            fs.chmodSync(targetPath, 0o755);
        }

        // geoip.dat/geosite.dat ship in every platform's zip with identical
        // content — grab them once for the routing rules (geosite:cn etc.).
        // The check-and-claim below is synchronous (no `await` in between),
        // so it's race-safe under Node's single-threaded event loop even
        // with these tasks running concurrently via Promise.all.
        if (!geoDataSaved) {
            geoDataSaved = true;
            const resourcesDir = 'src-tauri/resources';
            !fs.existsSync(resourcesDir) && fs.mkdirSync(resourcesDir, { recursive: true });
            for (const geoFile of ['geoip.dat', 'geosite.dat']) {
                const src = path.join(tmpDir, geoFile);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(resourcesDir, geoFile));
                }
            }
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

async function downloadEmbeddingExternalBinaries(): Promise<void> {
    const downloadTasks: Promise<void>[] = [];

    for (const [platform, archs] of Object.entries(RUST_TARGET_TRIPLES)) {
        for (const [arch, target] of Object.entries(archs)) {
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

    await Promise.all(downloadTasks);
}

// 并行执行所有下载任务
{
    const scriptStartTime = Date.now();
    console.log('Starting downloads...\n');

    downloadEmbeddingExternalBinaries().then(() => {
        const totalElapsed = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
        console.log(`\n✓ All downloads completed! Total time: ${totalElapsed}s`);
        process.exit(0);
    }).catch((error) => {
        const totalElapsed = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
        console.error(`\n✗ Download failed after ${totalElapsed}s:`, error);
        process.exit(1);
    });
}
