/**
 * Bundle IDs for the Expo Go runtime on each platform. Maestro flow files reference these via
 * the top-level `appId:` field. When we move from Expo Go to a dev build (e.g. via
 * `expo run:ios` / `expo run:android`), switch the value(s) referenced in the flows to our own
 * bundle id from `frontends/tactica-app/app.json`.
 */
export const EXPO_GO_BUNDLE_IDS = {
  ios: 'host.exp.Exponent',
  android: 'host.exp.exponent',
} as const
