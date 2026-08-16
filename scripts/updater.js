import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO = 'AureStream/AureStream';
const REQUIRED_TARGETS = [
  'darwin-aarch64-app',
  'darwin-x86_64-app',
  'linux-aarch64-appimage',
  'linux-aarch64-deb',
  'linux-aarch64-rpm',
  'linux-x86_64-appimage',
  'linux-x86_64-deb',
  'linux-x86_64-rpm',
  'windows-aarch64-msi',
  'windows-aarch64-nsis',
  'windows-x86_64-msi',
  'windows-x86_64-nsis',
];

function updaterPlatform(bundleName) {
  const name = bundleName.toLowerCase();
  const arm = name.includes('aarch64') || name.includes('arm64');
  const x64 = name.includes('x86_64') || name.includes('x64') || name.includes('amd64');

  if (name.endsWith('.app.tar.gz')) {
    if (name.startsWith('macos-aarch64-') || arm) return 'darwin-aarch64-app';
    if (name.startsWith('macos-x64-') || x64) return 'darwin-x86_64-app';
    return null;
  }
  if (name.endsWith('.appimage') || name.endsWith('.appimage.tar.gz')) {
    if (arm) return 'linux-aarch64-appimage';
    if (x64) return 'linux-x86_64-appimage';
    return null;
  }
  if (name.endsWith('.deb')) {
    if (arm) return 'linux-aarch64-deb';
    if (x64) return 'linux-x86_64-deb';
    return null;
  }
  if (name.endsWith('.rpm')) {
    if (arm) return 'linux-aarch64-rpm';
    if (x64) return 'linux-x86_64-rpm';
    return null;
  }
  if (name.endsWith('-setup.exe')) {
    if (arm) return 'windows-aarch64-nsis';
    if (x64) return 'windows-x86_64-nsis';
  }
  if (name.endsWith('.msi')) {
    if (arm) return 'windows-aarch64-msi';
    if (x64) return 'windows-x86_64-msi';
  }
  return null;
}

export function collectUpdaterAssets(assets) {
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const selected = new Map();

  for (const signatureAsset of assets.filter((asset) => asset.name.endsWith('.sig'))) {
    const bundleName = signatureAsset.name.slice(0, -4);
    const platform = updaterPlatform(bundleName);
    if (!platform) continue;

    const bundleAsset = byName.get(bundleName);
    if (!bundleAsset) {
      throw new Error(`Updater signature has no matching bundle: ${signatureAsset.name}`);
    }
    if (selected.has(platform)) {
      throw new Error(`Multiple updater bundles found for ${platform}`);
    }
    selected.set(platform, { bundleAsset, signatureAsset });
  }

  const missing = REQUIRED_TARGETS.filter((platform) => !selected.has(platform));
  if (missing.length > 0) {
    throw new Error(`Missing updater bundles for: ${missing.join(', ')}`);
  }
  return selected;
}

async function replaceReleaseAsset({ apiBase, release, name, body, headers }) {
  const existing = release.assets.find((asset) => asset.name === name);
  if (existing) {
    const response = await fetch(`${apiBase}/releases/assets/${existing.id}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to delete existing ${name}: ${response.statusText}`);
    }
  }

  const uploadUrl = release.upload_url.split('{')[0];
  const response = await fetch(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload ${name}: ${response.statusText} ${await response.text()}`);
  }
}

async function run() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN environment variable is required');

  const repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  const version = tauriConf.version;
  const tag = `v${version}`;
  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AureStream-Updater',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  console.log(`Fetching ${repo} release ${tag}...`);
  const releaseResponse = await fetch(`${apiBase}/releases/tags/${tag}`, { headers });
  if (!releaseResponse.ok) {
    throw new Error(`Failed to fetch release ${tag}: ${releaseResponse.statusText}`);
  }
  const release = await releaseResponse.json();
  const selected = collectUpdaterAssets(release.assets);
  const platforms = {};

  for (const platform of REQUIRED_TARGETS) {
    const { bundleAsset, signatureAsset } = selected.get(platform);
    const signatureResponse = await fetch(signatureAsset.browser_download_url, { headers });
    if (!signatureResponse.ok) {
      throw new Error(`Failed to download signature ${signatureAsset.name}`);
    }
    platforms[platform] = {
      signature: (await signatureResponse.text()).trim(),
      url: bundleAsset.browser_download_url,
    };
  }

  // Older updater clients only use the generic OS/architecture key.
  const genericFallbacks = {
    'darwin-aarch64': 'darwin-aarch64-app',
    'darwin-x86_64': 'darwin-x86_64-app',
    'linux-aarch64': 'linux-aarch64-appimage',
    'linux-x86_64': 'linux-x86_64-appimage',
    'windows-aarch64': 'windows-aarch64-nsis',
    'windows-x86_64': 'windows-x86_64-nsis',
  };
  for (const [generic, specific] of Object.entries(genericFallbacks)) {
    platforms[generic] = platforms[specific];
  }

  const manifest = JSON.stringify(
    {
      version,
      notes: release.body || `Release ${tag}`,
      pub_date: release.published_at || new Date().toISOString(),
      platforms,
    },
    null,
    2,
  );

  await replaceReleaseAsset({
    apiBase,
    release,
    name: 'latest.json',
    body: manifest,
    headers,
  });

  const outputDir = path.join(__dirname, '..', 'updater-manifest');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'latest.json'), `${manifest}\n`);
  console.log(`Generated signed updater manifest for ${REQUIRED_TARGETS.length} installer targets.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
