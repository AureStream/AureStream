import { describe, expect, it } from "vitest"

import { buildUpdaterManifests, type ReleaseAsset } from "./updater-manifest"

const releaseAssets: ReleaseAsset[] = [
  "AureStream.app.tar.gz",
  "AureStream.app.tar.gz.sig",
  "AureStream_0.3.2_aarch64.AppImage",
  "AureStream_0.3.2_aarch64.AppImage.sig",
  "AureStream_0.3.2_amd64.AppImage",
  "AureStream_0.3.2_amd64.AppImage.sig",
  "AureStream_0.3.2_arm64-setup.exe",
  "AureStream_0.3.2_arm64-setup.exe.sig",
  "AureStream_0.3.2_x64-setup.exe",
  "AureStream_0.3.2_x64-setup.exe.sig",
].map((name) => ({
  name,
  browser_download_url: `https://github.com/BadKid90s/AureStream/releases/download/v0.3.2/${name}`,
}))

describe("updater manifest generation", () => {
  it("maps signed release assets for all supported updater platforms", async () => {
    const { updateData, updateDataProxy } = await buildUpdaterManifests({
      version: "0.3.2",
      assets: releaseAssets,
      fetchSignature: async (asset) => `signature:${asset.name}`,
      now: () => "2026-06-30T00:00:00.000Z",
    })

    expect(Object.keys(updateData.platforms).sort()).toEqual([
      "darwin-aarch64",
      "darwin-x86_64",
      "linux-aarch64",
      "linux-x86_64",
      "windows-aarch64",
      "windows-x86_64",
    ])
    expect(updateData.platforms["windows-x86_64"].url).toContain(
      "AureStream_0.3.2_x64-setup.exe"
    )
    expect(updateData.platforms["windows-aarch64"].url).toContain(
      "AureStream_0.3.2_arm64-setup.exe"
    )
    expect(updateData.platforms["linux-x86_64"].url).toContain(
      "AureStream_0.3.2_amd64.AppImage"
    )
    expect(updateData.platforms["linux-aarch64"].url).toContain(
      "AureStream_0.3.2_aarch64.AppImage"
    )
    expect(updateData.platforms["darwin-x86_64"].url).toContain("AureStream.app.tar.gz")
    expect(updateData.platforms["darwin-aarch64"].url).toContain("AureStream.app.tar.gz")
    expect(updateData.platforms["windows-x86_64"].signature).toBe(
      "signature:AureStream_0.3.2_x64-setup.exe.sig"
    )
    expect(updateDataProxy.platforms["windows-x86_64"].url).toMatch(
      /^https:\/\/gh-proxy\.com\/https:\/\/github\.com/
    )
  })
})
