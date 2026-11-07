import { Stack } from 'expo-router'
import React from 'react'

/**
 * Makes `puzzles` one route in the tab bar rather than two. Without a layout here, Expo Router
 * flattens the directory into the parent navigator, so `index` and `[id]` would each become their
 * own tab — and the tab named `puzzles` wouldn't exist at all.
 *
 * The tab already renders a header, so this stack doesn't add another.
 */
/**
 * A deep link straight to `/puzzles/<id>` would otherwise open the puzzle with nothing underneath it,
 * so there'd be no list to go back to. This makes the list the stack's base screen regardless.
 */
export const unstable_settings = { anchor: 'index' }

const PuzzlesLayout: React.FC = () => <Stack screenOptions={{ headerShown: false }} />

export default PuzzlesLayout
