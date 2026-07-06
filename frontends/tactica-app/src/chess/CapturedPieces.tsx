import React from 'react'
import { View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { cburnett, type PieceCode } from './pieces/cburnett'

export interface CapturedPiecesProps {
  /** Pieces to display, already sorted. */
  pieces: PieceCode[]
  /** Rendered size of each piece; the row reserves this height even when empty. */
  size: number
  testID: string
}

/**
 * A horizontal row of captured pieces, slightly overlapping like a fanned hand of cards.
 * Later (more valuable) pieces render on top of earlier ones.
 */
export const CapturedPieces: React.FC<CapturedPiecesProps> = ({ pieces, size, testID }) => {
  const overlap = Math.floor(size * 0.4)

  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', height: size }}>
      {pieces.map((code, i) => (
        <View
          // Same piece type can appear multiple times, so the key needs the index
          key={`${code}-${i}`}
          testID={`${testID}-${code}-${i}`}
          style={{ marginLeft: i === 0 ? 0 : -overlap }}
        >
          <SvgXml xml={cburnett[code]} width={size} height={size} />
        </View>
      ))}
    </View>
  )
}
