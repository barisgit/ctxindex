import { defineOAuthApp } from '@ctxindex/extension-sdk'
import { googleOAuthProvider } from './google-oauth-provider'

export const ctxindexGoogleOAuthApp = defineOAuthApp(googleOAuthProvider, {
  label: 'ctxindex',
  config: {
    clientId:
      '436822801276-7rtmrbe5pajchbv3kchiqu4ned8sk1q8.apps.googleusercontent.com',
    // Native desktop Apps cannot keep this issued value confidential; it is
    // distributable public registration metadata, not a user credential.
    clientSecret: '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',
  },
})
