const fs = require('fs');
const path = require('path');

const matrixName = process.argv[2];
const rustTarget = process.argv[3];

if (!matrixName || !rustTarget) {
  console.error('Usage: node generate-updater-manifest.js <matrix_name> <rust_target>');
  process.exit(1);
}

// Map matrix name to Tauri v2 updater platform key
const platformMap = {
  'linux-x64': 'linux-x86_64',
  'windows-x64': 'windows-x86_64',
  'macos-aarch64': 'darwin-aarch64',
  'macos-x64': 'darwin-x86_64'
};

const updaterKey = platformMap[matrixName];
if (!updaterKey) {
  console.error(`Unknown matrix name: ${matrixName}`);
  process.exit(1);
}

// Read version from tauri.conf.json
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
const version = tauriConf.version;

// Find updater bundles and signatures
const bundleDir = path.join(__dirname, '..', 'src-tauri', 'target', rustTarget, 'release', 'bundle');

function findFiles(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(filePath, ext));
    } else if (file.endsWith(ext)) {
      results.push(filePath);
    }
  }
  return results;
}

const sigFiles = findFiles(bundleDir, '.sig');

if (sigFiles.length === 0) {
  console.warn(`No .sig files found in ${bundleDir}. Skipping manifest generation.`);
  process.exit(0);
}

// Find the appropriate sig file based on platform
let sigFilePath = sigFiles[0]; // fallback
for (const f of sigFiles) {
  const name = path.basename(f);
  if (matrixName.startsWith('linux') && name.includes('AppImage')) {
    sigFilePath = f;
    break;
  }
  if (matrixName.startsWith('windows') && name.includes('zip')) {
    sigFilePath = f;
    break;
  }
  if (matrixName.startsWith('macos') && name.includes('tar.gz')) {
    sigFilePath = f;
    break;
  }
}

const bundleFilePath = sigFilePath.slice(0, -4); // Remove .sig
if (!fs.existsSync(bundleFilePath)) {
  console.error(`Bundle file not found for signature: ${sigFilePath}`);
  process.exit(1);
}

const sigContent = fs.readFileSync(sigFilePath, 'utf8').trim();
const bundleFilename = path.basename(bundleFilePath);

const manifest = {
  version: version,
  notes: '',
  pub_date: new Date().toISOString(),
  platforms: {
    [updaterKey]: {
      signature: sigContent,
      url: `https://github.com/BadKid90s/AureStream/releases/download/v${version}/${bundleFilename}`
    }
  }
};

const outputDir = path.join(__dirname, '..', 'updater-artifacts');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, `latest-${matrixName}.json`);
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Generated updater manifest fragment at: ${outputPath}`);
