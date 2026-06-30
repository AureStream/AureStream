export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface PlatformUpdate {
  signature: string
  url: string
}

export interface UpdaterManifest {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, PlatformUpdate>
}

export async function buildUpdaterManifests(options: {
  version: string
  assets: ReleaseAsset[]
  fetchSignature: (asset: ReleaseAsset) => Promise<string>
  now?: () => string
}): Promise<{ updateData: UpdaterManifest; updateDataProxy: UpdaterManifest }> {
  const { version, assets, fetchSignature } = options
  const pubDate = options.now?.() ?? new Date().toISOString()

  const sigByName = new Map(assets.map((a) => [a.name, a]))
  const nonSigByName = new Map(
    assets.filter((a) => !a.name.endsWith('.sig')).map((a) => [a.name, a])
  )

  const platforms: Record<string, PlatformUpdate> = {}

  for (const asset of assets) {
    if (!asset.name.endsWith('.sig')) continue
    const bundleName = asset.name.slice(0, -'.sig'.length)
    const platformKeys = resolvePlatforms(bundleName)
    if (platformKeys.length === 0) continue

    let bundleAsset = nonSigByName.get(bundleName)
    if (!bundleAsset && platformKeys.includes('windows-x86_64')) {
      bundleAsset = [...nonSigByName.values()].find(
        (a) => a.name.includes('windows_x64_setup.exe') || a.name.endsWith('_setup.exe')
      )
    }
    if (!bundleAsset) continue

    const sigAsset = sigByName.get(asset.name)
    let signature = ''
    if (sigAsset) {
      try {
        signature = (await fetchSignature(sigAsset)).trim()
      } catch {
        continue
      }
    }

    for (const key of platformKeys) {
      platforms[key] = { signature, url: bundleAsset.browser_download_url }
    }
  }

  const updateData: UpdaterManifest = {
    version,
    notes: `Release v${version}`,
    pub_date: pubDate,
    platforms,
  }
  const updateDataProxy: UpdaterManifest = {
    version,
    notes: `Release v${version}`,
    pub_date: pubDate,
    platforms: Object.fromEntries(
      Object.entries(platforms).map(([key, value]) => [
        key,
        { signature: value.signature, url: `https://gh-proxy.com/${value.url}` },
      ])
    ),
  }

  return { updateData, updateDataProxy }
}

function resolvePlatforms(bundleName: string): string[] {
  if (bundleName === 'AureStream.app.tar.gz') {
    return ['darwin-aarch64', 'darwin-x86_64']
  }
  if (bundleName.includes('aarch64.app.tar.gz')) return ['darwin-aarch64']
  if (bundleName.includes('x64.app.tar.gz')) return ['darwin-x86_64']

  if (bundleName.endsWith('.exe') && !bundleName.includes('portable')) {
    return [bundleName.includes('arm64') ? 'windows-aarch64' : 'windows-x86_64']
  }
  if (bundleName.endsWith('.zip') && !bundleName.includes('portable')) {
    return [bundleName.includes('arm64') ? 'windows-aarch64' : 'windows-x86_64']
  }
  if (bundleName.endsWith('.AppImage')) {
    if (bundleName.includes('aarch64')) return ['linux-aarch64']
    return ['linux-x86_64']
  }
  if (bundleName.includes('AppImage.tar.gz')) {
    return ['linux-x86_64']
  }
  return []
}
