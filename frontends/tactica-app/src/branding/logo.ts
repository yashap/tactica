/**
 * Tactica brand marks as SVG strings (see assets/branding/README.md): the gold
 * crown (wordmark), the "Ascent" pawns (auth screens), and the crowned-pawn
 * "Coronation" glyph (favicon).
 */

/** Coronation gold, shared by the crown across all brand usages. */
export const BRAND_GOLD = '#D9A441'

/**
 * The gold crown on its own as an SVG string for SvgXml.
 * 24x14 units; render at any size with width ≈ height * 1.714.
 */
export const crownGlyphSvg = (): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14">
    <path fill="${BRAND_GOLD}" d="M2 13 L1 3 L6 7.5 L12 1 L18 7.5 L23 3 L22 13 Z"/>
  </svg>`

const pawnShapes = `
  <circle cx="32" cy="14" r="8"/>
  <rect x="23" y="24" width="18" height="4" rx="2"/>
  <path d="M27 30 C27 38 24 44 21 49 L43 49 C40 44 37 38 37 30 Z"/>
  <rect x="18" y="52" width="28" height="6" rx="2"/>`

/**
 * The "Ascent" mark as an SVG string for SvgXml: three pawns stepping up,
 * the last one crowned in gold. 58x52 units; width ≈ height * 1.115.
 */
export const ascentGlyphSvg = (pawnColor: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 6 58 52">
    <g fill="${pawnColor}">
      <g transform="translate(-1.4 31.6) scale(0.42)">${pawnShapes}</g>
      <g transform="translate(11.4 22.4) scale(0.58)">${pawnShapes}</g>
      <g transform="translate(25.7 11.9) scale(0.76)">${pawnShapes}</g>
    </g>
    <path fill="${BRAND_GOLD}" transform="translate(42.5 8) scale(0.625 0.607)" d="M2 13 L1 3 L6 7.5 L12 1 L18 7.5 L23 3 L22 13 Z"/>
  </svg>`

/**
 * The crowned-pawn glyph as an SVG string for SvgXml.
 * ~32x61 units; render at any size with width ≈ height * 0.525.
 */
export const coronationGlyphSvg = (pawnColor: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 0 32 61">
    <path fill="${BRAND_GOLD}" transform="translate(20 1) scale(1 0.9286)" d="M2 13 L1 3 L6 7.5 L12 1 L18 7.5 L23 3 L22 13 Z"/>
    <g fill="${pawnColor}">
      <circle cx="32" cy="19" r="8"/>
      <rect x="23" y="29" width="18" height="4" rx="2"/>
      <path d="M27 35 C27 42 24 47 21 51 L43 51 C40 47 37 42 37 35 Z"/>
      <rect x="18" y="54" width="28" height="6" rx="2"/>
    </g>
  </svg>`
