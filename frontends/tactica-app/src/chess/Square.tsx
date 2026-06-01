import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { cburnett, type PieceCode } from './pieces/cburnett'
import { type Square as SquareName } from './useChessGame'

export interface SquareProps {
  square: SquareName
  size: number
  isDark: boolean
  piece: PieceCode | null
  isSelected: boolean
  isLegalDestination: boolean
  disabled: boolean
  onPress: (square: SquareName) => void
}

const LIGHT_BG = '#F0D9B5'
const DARK_BG = '#B58863'
const SELECTED_OVERLAY = 'rgba(155, 199, 0, 0.5)' // lichess-style green selection
const LEGAL_DEST_DOT = 'rgba(20, 85, 30, 0.5)' // semi-transparent dark green

export const Square: React.FC<SquareProps> = React.memo(
  ({ square, size, isDark, piece, isSelected, isLegalDestination, disabled, onPress }) => {
    const backgroundColor = isDark ? DARK_BG : LIGHT_BG
    const dotSize = Math.max(8, Math.floor(size * 0.32))

    return (
      <Pressable
        testID={`square-${square}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => onPress(square)}
        style={[styles.square, { width: size, height: size, backgroundColor }]}
      >
        {isSelected && <View style={[StyleSheet.absoluteFill, { backgroundColor: SELECTED_OVERLAY }]} />}
        {piece && (
          // Absolute-fill View carrying the piece testID. SvgXml's own `testID` doesn't
          // propagate to `data-testid` on react-native-web, so we'd otherwise be unable to
          // assert which piece is on a given square. The View must be sized (not zero-sized)
          // for some Playwright visibility checks to pass — absoluteFill does that and also
          // pins it over the Pressable.
          <View testID={`piece-${piece}-${square}`} style={StyleSheet.absoluteFill} pointerEvents="none">
            <SvgXml xml={cburnett[piece]} width={size} height={size} />
          </View>
        )}
        {isLegalDestination && !piece && (
          <View
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: LEGAL_DEST_DOT,
              },
            ]}
          />
        )}
        {isLegalDestination && piece && (
          // Capture target — ring instead of dot, easier to see over a piece
          <View style={[StyleSheet.absoluteFill, styles.captureRing]} />
        )}
      </Pressable>
    )
  },
)

Square.displayName = 'Square'

const styles = StyleSheet.create({
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
  },
  captureRing: {
    borderWidth: 4,
    borderColor: 'rgba(20, 85, 30, 0.5)',
  },
})
