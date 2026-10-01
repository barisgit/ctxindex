import { defineExtension } from '@ctxindex/extension-sdk'
import { activationAdapter } from './activation-provider'

export default defineExtension({
  id: 'fixture.activation',
  adapters: [activationAdapter('fixture.activation.v3')],
})
