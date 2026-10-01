import { defineExtension, defineOAuthApp } from '@ctxindex/extension-sdk'
import { activationAdapter, activationProvider } from './activation-provider'

// Declares the same Provider/label identity as a local OAuth App the journey
// creates first, so activation must be rejected.
const collidingApp = defineOAuthApp(activationProvider, {
  label: 'work',
  config: { clientId: 'extension-client-id' },
})

export default defineExtension({
  id: 'fixture.activation',
  oauthApps: [collidingApp],
  adapters: [activationAdapter('fixture.activation.v2')],
})
