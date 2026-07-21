import { readFile } from 'node:fs/promises'
import { describeAction, runAction } from '@ctxindex/core/action'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import { type CliDeps, openDeps } from '../deps'
import { formatActionDescribeText, formatActionRunText } from '../format/action'
import { mapErrorToExit } from '../format/exit'

export type ActionDeps = Pick<
  CliDeps,
  'db' | 'registry' | 'authService' | 'logger' | 'sourceService' | 'close'
>
type OpenActionDeps = () => Promise<ActionDeps>

export interface ActionServices {
  readonly describe: typeof describeAction
  readonly run: typeof runAction
}

const actionServices: ActionServices = {
  describe: describeAction,
  run: runAction,
}

export type ActionCommandInput =
  | {
      readonly kind: 'describe'
      readonly actionId: string
      readonly sourceId?: string
      readonly json: boolean
    }
  | {
      readonly kind: 'run'
      readonly actionId: string
      readonly sourceId: string
      readonly input: string
      readonly json: boolean
    }

function invalidInput(): CtxindexValidationError {
  return new CtxindexValidationError(
    'invalid_action_input',
    'Action input must be inline JSON or a readable UTF-8 JSON file',
  )
}

export async function parseActionInput(value: string): Promise<unknown> {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }

  try {
    return JSON.parse(await readFile(value, 'utf8'))
  } catch {
    throw invalidInput()
  }
}

export async function handleActionCommand(
  input: ActionCommandInput,
  open: OpenActionDeps = openDeps,
  services: ActionServices = actionServices,
): Promise<number> {
  let actionInput: unknown
  if (input.kind === 'run') {
    try {
      actionInput = await parseActionInput(input.input)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      return mapErrorToExit(error)
    }
  }

  let deps: ActionDeps | undefined
  try {
    deps = await open()
    if (input.kind === 'describe') {
      const sourceId = input.sourceId
        ? deps.sourceService.resolveSourceId(input.sourceId)
        : undefined
      const result = services.describe({
        db: deps.db,
        registry: deps.registry,
        actionId: input.actionId,
        ...(sourceId ? { sourceId } : {}),
      })
      console.log(
        input.json ? JSON.stringify(result) : formatActionDescribeText(result),
      )
      return 0
    }

    const sourceId = deps.sourceService.resolveSourceId(input.sourceId)
    const result = await services.run({
      db: deps.db,
      registry: deps.registry,
      authService: deps.authService,
      logger: deps.logger,
      actionId: input.actionId,
      sourceId,
      actionInput,
      signal: new AbortController().signal,
      confirmIrreversible: false,
    })
    console.log(
      input.json ? JSON.stringify(result) : formatActionRunText(result),
    )
    for (const warning of result.warnings) {
      console.error(`${warning.code}\t${warning.message}`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps?.close()
  }
}
