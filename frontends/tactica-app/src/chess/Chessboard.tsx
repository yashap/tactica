import React, { useCallback, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import { CapturedPieces } from './CapturedPieces'
import { Square } from './Square'
import { type Square as SquareName, useChessGame } from './useChessGame'

const FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const MAX_BOARD_SIZE = 480

export interface ChessboardProps {
  onMove?: (san: string) => void
}

export const Chessboard: React.FC<ChessboardProps> = ({ onMove }) => {
  const game = useChessGame()
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

  const squareSize = Math.floor(boardSize / 8)
  const labelGutter = Math.max(12, Math.floor(squareSize * 0.3))
  const boardRowWidth = squareSize * 8 + labelGutter
  const capturedPieceSize = Math.max(20, Math.floor(squareSize * 0.55))

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {/* Black's side of the board — the white pieces black has captured */}
      <View style={{ width: boardRowWidth, paddingLeft: labelGutter, marginBottom: 4 }}>
        <CapturedPieces pieces={game.capturedByBlack} size={capturedPieceSize} testID="capturedByBlack" />
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
          {Array.from({ length: 8 }).map((_, rankIdx) => (
            <View key={rankIdx} style={{ height: squareSize, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={styles.label}>{8 - rankIdx}</Text>
            </View>
          ))}
        </View>
        <View>
          {game.board.map((row, rankIdx) => (
            <View key={rankIdx} style={{ flexDirection: 'row' }}>
              {row.map((cell, fileIdx) => {
                const sq = cell?.square ?? (`${FILE_LABELS[fileIdx]}${8 - rankIdx}` as SquareName)
                const isDark = (rankIdx + fileIdx) % 2 === 1
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
            {FILE_LABELS.map((file) => (
              <View key={file} style={{ width: squareSize, alignItems: 'center' }}>
                <Text style={styles.label}>{file}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      {/* White's side of the board — the black pieces white has captured */}
      <View style={{ width: boardRowWidth, paddingLeft: labelGutter, marginTop: 4 }}>
        <CapturedPieces pieces={game.capturedByWhite} size={capturedPieceSize} testID="capturedByWhite" />
      </View>
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
