// v4 report fonts. Direction B uses Space Grotesk (display) + IBM Plex Mono (mono/cites).
//
// ⚠ HARD GATE (Brain port prompt): customer render REQUIRES self-hosted / embedded fonts —
// the mock's linked Google Fonts do NOT satisfy the gate. The @import below is a BUILD-VERIFY
// stopgap so the no-regression render can be screenshotted; it is REPLACED with base64-embedded
// woff2 @font-face (self-contained, PDF-safe, offline) before this renderer wires to the route.
// Tracked: build step "font self-host" — must land before renderV4ReportFromRow reaches prod.
export const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

// set true once FONT_CSS carries embedded @font-face (no network) — gate check before prod wire.
export const FONTS_SELF_HOSTED = false;
