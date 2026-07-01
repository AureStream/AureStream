import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  // Read version from tauri.conf.json
  const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  const version = tauriConf.version;
  const tag = `v${version}`;

  const repo = 'BadKid90s/AureStream';
  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'AureStream-Updater',
    'Authorization': `Bearer ${token}`
  };

  console.log(`Fetching release information for tag: ${tag}...`);
  const releaseRes = await fetch(`${apiBase}/releases/tags/${tag}`, { headers });
  if (!releaseRes.ok) {
    console.error(`Failed to fetch release: ${releaseRes.statusText}`);
    process.exit(1);
  }

  const release = await releaseRes.json();
  const releaseId = release.id;
  const uploadUrlTemplate = release.upload_url; // e.g. "https://uploads.github.com/repos/.../assets{?name,label}"
  const uploadUrl = uploadUrlTemplate.split('{')[0];

  const updateData = {
    version: version,
    notes: `Release v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // Find signatures and their corresponding asset URLs
  const sigAssets = release.assets.filter(a => a.name.endsWith('.sig'));
  const otherAssets = release.assets.filter(a => !a.name.endsWith('.sig'));

  for (const sigAsset of sigAssets) {
    const sigName = sigAsset.name;
    const bundleName = sigName.slice(0, -4); // remove .sig

    let platformKeys = [];
    if (bundleName === 'AureStream.app.tar.gz') {
      platformKeys = ['darwin-aarch64', 'darwin-x86_64'];
    } else if (bundleName.includes('aarch64.app.tar.gz')) {
      platformKeys = ['darwin-aarch64'];
    } else if (bundleName.includes('x64.app.tar.gz')) {
      platformKeys = ['darwin-x86_64'];
    } else if ((bundleName.endsWith('.zip') || bundleName.endsWith('.exe')) && !bundleName.includes('portable')) {
      platformKeys = ['windows-x86_64'];
    } else if (bundleName.includes('AppImage.tar.gz')) {
      platformKeys = ['linux-x86_64'];
    }

    if (platformKeys.length === 0) {
      console.warn(`Could not determine platform for bundle: ${bundleName}`);
      continue;
    }

    let bundleAsset = otherAssets.find(a => a.name === bundleName);
    if (!bundleAsset && platformKeys.includes('windows-x86_64')) {
      // Fallback for renamed windows installer (e.g. aurestream_0.2.2_windows_x64_setup.exe)
      bundleAsset = otherAssets.find(a => a.name.includes('windows_x64_setup.exe') || a.name.endsWith('_setup.exe'));
    }

    if (!bundleAsset) {
      console.warn(`No matching bundle found for signature: ${sigName}`);
      continue;
    }

    console.log(`Downloading signature content for ${sigName}...`);
    const sigRes = await fetch(sigAsset.browser_download_url);
    if (!sigRes.ok) {
      console.error(`Failed to download signature for ${sigName}`);
      continue;
    }
    const signature = await sigRes.text();

    for (const key of platformKeys) {
      updateData.platforms[key] = {
        signature: signature.trim(),
        url: bundleAsset.browser_download_url
      };
    }
  }

  const manifestContent = JSON.stringify(updateData, null, 2);
  console.log('Generated updater manifest data:', manifestContent);

  // Generate proxied update data
  const updateDataProxy = {
    version: version,
    notes: `Release v${version}`,
    pub_date: updateData.pub_date,
    platforms: {}
  };

  for (const [key, value] of Object.entries(updateData.platforms)) {
    updateDataProxy.platforms[key] = {
      signature: value.signature,
      url: `https://gh-proxy.com/${value.url}`
    };
  }
  const manifestProxyContent = JSON.stringify(updateDataProxy, null, 2);
  console.log('Generated proxied updater manifest data:', manifestProxyContent);

  // Check if latest.json already exists in release
  const existingLatest = release.assets.find(a => a.name === 'latest.json');
  if (existingLatest) {
    console.log(`Deleting existing latest.json asset (ID: ${existingLatest.id})...`);
    const deleteRes = await fetch(`${apiBase}/releases/assets/${existingLatest.id}`, {
      method: 'DELETE',
      headers
    });
    if (!deleteRes.ok) {
      console.error(`Failed to delete existing latest.json: ${deleteRes.statusText}`);
    }
  }

  // Upload new latest.json
  console.log(`Uploading new latest.json to release ${releaseId}...`);
  const uploadRes = await fetch(`${uploadUrl}?name=latest.json`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: manifestContent
  });

  if (uploadRes.ok) {
    console.log('Successfully uploaded latest.json to GitHub Release!');
  } else {
    const errorText = await uploadRes.text();
    console.error(`Failed to upload latest.json: ${uploadRes.statusText}`, errorText);
    process.exit(1);
  }

  // Check if latest-proxy.json already exists in release
  const existingProxy = release.assets.find(a => a.name === 'latest-proxy.json');
  if (existingProxy) {
    console.log(`Deleting existing latest-proxy.json asset (ID: ${existingProxy.id})...`);
    const deleteRes = await fetch(`${apiBase}/releases/assets/${existingProxy.id}`, {
      method: 'DELETE',
      headers
    });
    if (!deleteRes.ok) {
      console.error(`Failed to delete existing latest-proxy.json: ${deleteRes.statusText}`);
    }
  }

  // Upload new latest-proxy.json
  console.log(`Uploading new latest-proxy.json to release ${releaseId}...`);
  const uploadProxyRes = await fetch(`${uploadUrl}?name=latest-proxy.json`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: manifestProxyContent
  });

  if (uploadProxyRes.ok) {
    console.log('Successfully uploaded latest-proxy.json to GitHub Release!');
  } else {
    const errorText = await uploadProxyRes.text();
    console.error(`Failed to upload latest-proxy.json: ${uploadProxyRes.statusText}`, errorText);
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
