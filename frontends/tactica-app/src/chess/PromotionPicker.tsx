import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { cburnett, type PieceCode } from './pieces/cburnett'

export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

const CHOICES: { piece: PromotionPiece; label: string }[] = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
]

export interface PromotionPickerProps {
  /** Whose pawn is promoting, so the pieces shown are the right colour. */
  color: 'w' | 'b'
  size: number
  onSelect: (piece: PromotionPiece) => void
  onCancel: () => void
}

/**
 * Shown when a puzzle move promotes a pawn. The board otherwise auto-queens, which is right for
 * casual play but wrong here: under-promotion is occasionally the only winning move, and a puzzle
 * that silently queened would mark the correct answer wrong.
 */
export const PromotionPicker: React.FC<PromotionPickerProps> = ({ color, size, onSelect, onCancel }) => (
  <View style={styles.container} testID="promotionPicker">
    <Text style={styles.prompt}>Promote to…</Text>
    <View style={styles.row}>
      {CHOICES.map(({ piece, label }) => {
        const code = `${color}${piece.toUpperCase()}` as PieceCode
        return (
          <Pressable
            key={piece}
            testID={`promotionPicker-${piece}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(piece)}
            style={[styles.choice, { width: size, height: size }]}
          >
            <SvgXml xml={cburnett[code]} width={size * 0.85} height={size * 0.85} />
          </Pressable>
        )
      })}
    </View>
    <Pressable testID="promotionPickerCancel" onPress={onCancel} style={styles.cancel}>
      <Text style={styles.cancelText}>Cancel</Text>
    </Pressable>
  </View>
)

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  prompt: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  choice: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#F0D9B5',
  },
  cancel: { padding: 6 },
  cancelText: { color: '#1f6feb', fontSize: 14 },
})
