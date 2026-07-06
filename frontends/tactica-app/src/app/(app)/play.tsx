import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Chessboard } from '../../chess/Chessboard'

const PlayScreen: React.FC = () => {
  return (
    <View style={styles.container} testID="playScreen">
      <Chessboard />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
})

export default PlayScreen
