import { defineOAuthApp } from '@ctxindex/extension-sdk'
import { microsoftOAuthProvider } from './provider'

export const ctxindexMicrosoftOAuthApp = defineOAuthApp(
  microsoftOAuthProvider,
  {
    label: 'ctxindex',
    config: { clientId: '22d1ed12-fd44-4c74-82cc-ecc8cc962697' },
  },
)
