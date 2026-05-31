import { TacticaCoreClient } from '@tactica/tactica-core-client'
import { buildTacticaAxios } from '../auth/buildTacticaAxios'

// Shares the same builder (and therefore the same SuperTokens auto-refresh behavior) as authApi.
// Each axios instance still maintains its own in-flight refresh promise — that's fine because
// they share cookies, so a refresh triggered via either instance updates the access token cookie
// the other instance reads on its next call.
const axiosInstance = buildTacticaAxios()

export const tacticaCoreClient = new TacticaCoreClient(axiosInstance)
