import React from 'react'
import { SvgXml } from 'react-native-svg'
import { ascentGlyphSvg } from './logo'

export interface AscentLogoProps {
  /** Rendered height in px; width scales to the mark's aspect ratio. */
  size?: number
  /** Ink color for the pawns; the crown stays brand gold. */
  color?: string
}

/** The "Ascent" mark: three pawns stepping up, the last one crowned. */
export const AscentLogo: React.FC<AscentLogoProps> = ({ size = 64, color = '#1C1915' }) => (
  <SvgXml xml={ascentGlyphSvg(color)} width={size * 1.115} height={size} />
)
