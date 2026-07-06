import React from 'react'
import { SvgXml } from 'react-native-svg'
import { coronationGlyphSvg } from './logo'

export interface TacticaLogoProps {
  /** Rendered height in px; width scales to the glyph's aspect ratio. */
  size?: number
  /** Ink color for the pawn; the crown stays brand gold. */
  color?: string
}

/** The crowned-pawn glyph on its own — Tactica's standalone logo. */
export const TacticaLogo: React.FC<TacticaLogoProps> = ({ size = 64, color = '#1C1915' }) => (
  <SvgXml xml={coronationGlyphSvg(color)} width={size * 0.525} height={size} />
)
