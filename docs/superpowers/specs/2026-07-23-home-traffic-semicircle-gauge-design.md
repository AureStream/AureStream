# Home Traffic Semicircle Gauge Design

## Goal

Replace the Home page subscription card's circular remaining-traffic ring with a semicircle gauge matching the provided reference image.

## Design

- Keep existing remaining-traffic calculations unchanged.
- Replace the full circular progress ring with an SVG semicircle gauge.
- The gauge should be centered in the top area of the subscription card.
- Use a light gray semicircle track.
- Use a yellow-green to green progress gradient to match the reference image.
- Show remaining traffic value in the center of the gauge.
- Show the label "Remaining Traffic" / "剩余流量" below the value.
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
