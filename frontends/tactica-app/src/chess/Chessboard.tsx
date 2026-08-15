import React, { useCallback, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import { CapturedPieces } from './CapturedPieces'
import { PromotionPicker } from './PromotionPicker'
import { Square } from './Square'
import { type ChessGame, type Square as SquareName, useChessGame } from './useChessGame'

const FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const MAX_BOARD_SIZE = 480

export interface ChessboardProps {
  onMove?: (san: string) => void
  /**
   * Drive the board from outside. Puzzles need this so the screen can grade the move; the hotseat
   * play screen omits it and lets the board own its own game.
   */
  game?: ChessGame
  /** Which side sits at the bottom. Purely a view transform — the game state is unaffected. */
  orientation?: 'white' | 'black'
}

export const Chessboard: React.FC<ChessboardProps> = ({ onMove, game: providedGame, orientation = 'white' }) => {
  // Always called (hooks can't be conditional); ignored when a game is supplied.
  const ownGame = useChessGame()
  const game = providedGame ?? ownGame
  const [boardSize, setBoardSize] = useState(0)

  const onContainerLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout
    const next = Math.min(width, height, MAX_BOARD_SIZE)
    setBoardSize(next)
  }, [])

  const lastReportedRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (game.lastMoveSan && game.lastMoveSan !== lastReportedRef.current) {
      lastReportedRef.current = game.lastMoveSan
      onMove?.(game.lastMoveSan)
    }
  }, [game.lastMoveSan, onMove])

  const handlePress = useCallback(
    (sq: SquareName): void => {
      game.selectSquare(sq)
    },
    [game],
  )

  if (boardSize === 0) {
    return <View style={styles.container} onLayout={onContainerLayout} testID="chessBoard" />
  }

  const flipped = orientation === 'black'
  // `game.board` is always white-on-bottom; reversing rows and cells is the whole of the flip.
  const displayRows = flipped ? [...game.board].reverse().map((row) => [...row].reverse()) : game.board
  const rankLabels = flipped ? Array.from({ length: 8 }, (_, i) => i + 1) : Array.from({ length: 8 }, (_, i) => 8 - i)
  const fileLabels = flipped ? [...FILE_LABELS].reverse() : FILE_LABELS

  const squareSize = Math.floor(boardSize / 8)
  const labelGutter = Math.max(12, Math.floor(squareSize * 0.3))
  const boardRowWidth = squareSize * 8 + labelGutter
  const capturedPieceSize = Math.max(20, Math.floor(squareSize * 0.55))

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {/* Black's side of the board — the white pieces black has captured */}
      <View style={{ width: boardRowWidth, paddingLeft: labelGutter, marginBottom: 4 }}>
        <CapturedPieces
          pieces={flipped ? game.capturedByWhite : game.capturedByBlack}
          size={capturedPieceSize}
          testID={flipped ? 'capturedByWhite' : 'capturedByBlack'}
        />
      </View>
      <View
        style={{
          width: boardRowWidth,
          flexDirection: 'row',
        }}
        testID="chessBoard"
      >
        {/* Rank labels (8 down to 1) */}
        <View style={{ width: labelGutter, justifyContent: 'space-between' }}>
          {rankLabels.map((rank) => (
            <View key={rank} style={{ height: squareSize, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={styles.label}>{rank}</Text>
            </View>
          ))}
        </View>
        <View>
          {displayRows.map((row, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: 'row' }}>
              {row.map((cell, colIdx) => {
                // Derive the square name from the display position when the cell is empty
                const sq = cell?.square ?? (`${fileLabels[colIdx]}${rankLabels[rowIdx]}` as SquareName)
                const isDark = (rowIdx + colIdx) % 2 === 1
                return (
                  <Square
                    key={sq}
                    square={sq}
                    size={squareSize}
                    isDark={isDark}
                    piece={cell?.code ?? null}
                    isSelected={game.selectedSquare === sq}
                    isLegalDestination={game.legalDestinations.includes(sq)}
                    checkState={game.checkedKingSquare === sq ? (game.isCheckmate ? 'checkmate' : 'check') : null}
                    onPress={handlePress}
                  />
                )
              })}
            </View>
          ))}
          {/* File labels (a..h) */}
          <View style={{ flexDirection: 'row', marginTop: 2 }}>
            {fileLabels.map((file) => (
              <View key={file} style={{ width: squareSize, alignItems: 'center' }}>
                <Text style={styles.label}>{file}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      {/* White's side of the board — the black pieces white has captured */}
      <View style={{ width: boardRowWidth, paddingLeft: labelGutter, marginTop: 4 }}>
        <CapturedPieces
          pieces={flipped ? game.capturedByBlack : game.capturedByWhite}
          size={capturedPieceSize}
          testID={flipped ? 'capturedByBlack' : 'capturedByWhite'}
        />
      </View>
      {game.pendingPromotion && (
        <View style={{ marginTop: 12 }}>
          <PromotionPicker
            color={game.turn}
            size={Math.max(36, Math.floor(squareSize * 0.9))}
            onSelect={game.completePromotion}
            onCancel={game.cancelPromotion}
          />
        </View>
      )}
      <Text testID="turnIndicator" style={[styles.summary, (game.isCheck || game.gameOverText) && styles.alert]}>
        {game.gameOverText ?? `${game.turn === 'w' ? 'White' : 'Black'} to move${game.isCheck ? ' — check!' : ''}`}
      </Text>
      {game.lastMoveSan && (
        <Text testID="moveSummary" style={styles.summary}>
          Last move: {game.lastMoveSan}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  label: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  summary: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
  },
  alert: {
    color: '#c00000',
    fontWeight: '600',
  },
})
