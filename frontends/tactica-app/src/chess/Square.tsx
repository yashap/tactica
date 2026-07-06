import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg'
import { cburnett, type PieceCode } from './pieces/cburnett'
import { type Square as SquareName } from './useChessGame'

export interface SquareProps {
  square: SquareName
  size: number
  isDark: boolean
  piece: PieceCode | null
  isSelected: boolean
  isLegalDestination: boolean
  /** Set on the king's square when that king is in check or checkmated. */
  checkState: 'check' | 'checkmate' | null
  onPress: (square: SquareName) => void
}

const LIGHT_BG = '#F0D9B5'
const DARK_BG = '#B58863'
const SELECTED_OVERLAY = 'rgba(155, 199, 0, 0.5)' // lichess-style green selection
const LEGAL_DEST_DOT = 'rgba(20, 85, 30, 0.5)' // semi-transparent dark green

export const Square: React.FC<SquareProps> = React.memo(
  ({ square, size, isDark, piece, isSelected, isLegalDestination, checkState, onPress }) => {
    const backgroundColor = isDark ? DARK_BG : LIGHT_BG
    const dotSize = Math.max(8, Math.floor(size * 0.32))

    return (
      <Pressable
        testID={`square-${square}`}
        accessibilityRole="button"
        onPress={() => onPress(square)}
        style={[styles.square, { width: size, height: size, backgroundColor }]}
      >
        {isSelected && <View style={[StyleSheet.absoluteFill, { backgroundColor: SELECTED_OVERLAY }]} />}
        {checkState && (
          // Red glow under the checked king — lichess-style radial for check, near-solid for
          // checkmate. Rendered before the piece so the king stays visible on top.
          <View testID={`${checkState}-${square}`} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={size} height={size}>
              <Defs>
                <RadialGradient id={`checkGradient-${square}`} cx="50%" cy="50%" r="70%">
                  <Stop offset="0%" stopColor="#e00000" stopOpacity={checkState === 'checkmate' ? 1 : 0.9} />
                  <Stop offset="60%" stopColor="#e00000" stopOpacity={checkState === 'checkmate' ? 0.9 : 0.55} />
                  <Stop offset="100%" stopColor="#e00000" stopOpacity={checkState === 'checkmate' ? 0.7 : 0} />
                </RadialGradient>
              </Defs>
              <Rect width={size} height={size} fill={`url(#checkGradient-${square})`} />
            </Svg>
          </View>
        )}
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
