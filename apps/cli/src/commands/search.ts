import { resolveSearchArgs, searchArgs } from '../args/search'
import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import {
  formatSearchJson,
  formatSearchPretty,
  formatSearchText,
  handleSearchCommand,
} from '../search/handle-search-command'

export {
  formatSearchJson,
  formatSearchPretty,
  formatSearchText,
  handleSearchCommand,
}

export const searchCommand = defineCtxCommand({
  meta: { name: 'search', description: 'Search context Resources.' },
  args: searchArgs,
  run: ({ args }) =>
    runWithExit(() => handleSearchCommand(resolveSearchArgs(args))),
})
