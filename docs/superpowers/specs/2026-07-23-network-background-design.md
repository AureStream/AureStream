# Network Background Design

## Goal

Replace the current static `/wallpaper.jpg` dashboard background with a lightweight, programmatic CSS/SVG-style background that communicates network connectivity while preserving readability across AureStream's mobile UI.

## Selected Direction

Use direction B1: low-saturation network grid with sparse node highlights.

This direction was selected because it fits a proxy/VPN client better than the current watercolor sky image, avoids a heavy raster asset, and can be tuned separately for light and dark themes.

## Current Context

- `src/components/Dashboard.tsx` currently renders the global mobile shell background.
- The current background uses `/wallpaper.jpg` from `public/wallpaper.jpg`.
- `public/wallpaper.jpg` is a 768×1376 JPEG.
- The dashboard already has layered overlays and wraps all nested routes:
  - home
  - nodes
  - profile
  - about

## Design

Create a reusable dashboard background layer rendered by CSS classes rather than a static image.

The background will use these visual layers:

1. Base gradient
   - Light theme: cold white and pale blue-gray.
   - Dark theme: deep blue-black.

2. Low-opacity radial glows
   - Purple-blue glow near the upper-left area.
   - Cyan/green glow near the upper-right area.
   - Soft blue glow near the mid-lower area.

3. Fine grid
   - Built from CSS `linear-gradient` layers.
   - Visible mostly in the upper/mid background.
   - Fades downward using a mask so it does not compete with bottom content.

4. Sparse network nodes
   - Built from CSS `radial-gradient` dots.
   - Limited count and low opacity.
   - Used as accents, not a full pattern.

5. Existing readability overlay
   - Keep a final soft overlay above the background texture and below content.
   - Tune light/dark opacity independently.

## Implementation Scope

Expected changed files:

- `src/components/Dashboard.tsx`
  - Remove the inline `style={{ backgroundImage: "url('/wallpaper.jpg')" }}` usage.
  - Replace it with a CSS class-based background container.
  - Keep the existing `pointer-events-none` and z-index layering behavior.

- `src/index.css`
  - Add background classes for the programmatic network background.
  - Add dark-theme overrides under `[data-theme="dark"]`.
  - Keep all effects local to the dashboard background class names.

No new image asset should be added. `public/wallpaper.jpg` may remain in the repository if no cleanup is requested.

## Acceptance Criteria

- The dashboard no longer references `/wallpaper.jpg`.
- All dashboard child pages share the new background:
  - home
  - nodes
  - profile
  - about
- Light theme shows a restrained network-grid feel.
- Dark theme has visible depth without excessive glow.
- Text, cards, buttons, and glass surfaces remain readable.
- No network request or image decode is needed for the background.
- TypeScript/build checks pass.

## Non-Goals

- Do not redesign page layout or card components.
- Do not introduce animated backgrounds.
- Do not add new runtime dependencies.
- Do not replace app branding, logo, icons, or theme tokens outside the background.
