import { getLogger, LogLevel } from '@tactica/logging'
import supertokens from 'supertokens-node'
import EmailPassword from 'supertokens-node/recipe/emailpassword/index.js'
import Session from 'supertokens-node/recipe/session/index.js'
import { config } from '../config.js'

export const initSuperTokens = (): void => {
  supertokens.init({
    framework: 'fastify',
    // When LOG_LEVEL is `debug` or `trace`, turn on SuperTokens' own verbose logging. This prints
    // detailed `com.supertokens {...}` lines to stdout showing exactly what each recipe decides
    // (e.g. why a session check fails on /auth/signout), which the access log alone can't show.
    debug: getLogger().isLevelEnabled(LogLevel.Debug),
    supertokens: {
      connectionURI: config.supertokens.connectionUri,
      ...(config.supertokens.apiKey ? { apiKey: config.supertokens.apiKey } : {}),
    },
    appInfo: {
      appName: 'Tactica',
      apiDomain: config.apiDomain,
      websiteDomain: config.websiteDomain,
      apiBasePath: '/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [
      EmailPassword.init(),
      Session.init({
        // Use cookies for browser clients; SuperTokens will still attach access tokens via response
        // headers but the canonical session state lives in cookies the browser auto-attaches.
        getTokenTransferMethod: () => 'cookie',
      }),
    ],
  })
}
