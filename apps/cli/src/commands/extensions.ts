import { defineCommand } from 'citty'
import {
  extensionsCommand as extensionsCommandDefinition,
  handleExtensionsCommand,
} from '../extensions'

export { handleExtensionsCommand }

export const extensionsCommand = defineCommand(extensionsCommandDefinition)
