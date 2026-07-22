# Home Traffic Semicircle Gauge Design

## Goal

Replace the Home page subscription card's circular remaining-traffic ring with a semicircle gauge matching the provided reference image.

## Design

- Keep existing remaining-traffic calculations unchanged.
- Replace the full circular progress ring with an SVG semicircle gauge.
- Keep the original left-side text block unchanged.
- Render the semicircle gauge on the right side where the circular percentage ring used to be.
- Use a light gray semicircle track.
- Use a yellow-green to green progress gradient to match the reference image.
- Show the remaining percentage in the center of the right-side gauge.
- Keep the lower "Used" and "Expiration" rows unchanged.

## Acceptance Criteria

- `MobileHome.tsx` no longer renders the full circular traffic ring.
- The top of the subscription card renders a semicircle gauge.
- The gauge progress still uses `remainingPercent`.
- The displayed remaining traffic still uses `remainingGBValue`.
- `pnpm test` passes.
- `pnpm build` passes.

## Non-Goals

- Do not change traffic calculations.
- Do not change subscription loading behavior.
- Do not redesign the rest of the Home page.
