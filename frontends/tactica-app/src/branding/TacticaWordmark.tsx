import React from 'react'
import { Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { crownGlyphSvg } from './logo'

export interface TacticaWordmarkProps {
  /** Cap height of the wordmark in px. The crown and tracking scale with it. */
  size?: number
  /** Ink color for the letters. The navigation header is always light today,
   * so this defaults to dark ink; revisit if the app gains a dark theme. */
  color?: string
}

/**
 * The TACTICA wordmark: a gold crown, letter-sized, leading the name.
 */
export const TacticaWordmark: React.FC<TacticaWordmarkProps> = ({ size = 17, color = '#1C1915' }) => {
  const crownHeight = size * 0.72
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SvgXml
        xml={crownGlyphSvg()}
        width={crownHeight * 1.714}
        height={crownHeight}
        style={{ marginRight: size * 0.35 }}
      />
      <Text
        style={{
          color,
          fontSize: size,
          fontWeight: '800' as const,
          letterSpacing: size * 0.12,
        }}
      >
        TACTICA
      </Text>
    </View>
  )
}
