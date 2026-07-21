import { CodeHighlight } from '@/components/code-highlight'
import { CopyButton } from '@/components/copy-button'

// Launch handoff: replace only these constants when the demo Extension is
// published to npm. The source-checkout path below is runnable today.
export const DEMO_EXTENSION_TARGET = './examples/tenders-extension'
export const DEMO_EXTENSION_ID = 'ctxindex.demo'

const DEMO_STEPS = [
  {
    title: 'Get the code',
    detail: 'Bun 1.3.14 · one checkout, no other setup',
    commands: `git clone https://github.com/barisgit/ctxindex.git
cd ctxindex && bun install && bun cli init`,
  },
  {
    title: 'Install the demo Extension',
    detail: 'checked into the repo · deterministic fixture data',
    commands: `bun cli extension install local ${DEMO_EXTENSION_TARGET} ${DEMO_EXTENSION_ID}`,
  },
  {
    title: 'Create a Realm, add the Source, sync',
    detail: 'the same motions as a real account — minus OAuth',
    commands: `bun cli realm add demo --name "Demo"
bun cli source add ctxindex.demo.tenders --realm demo --label demo-tenders
bun cli sync --source demo-tenders`,
  },
  {
    title: 'Search it like an agent would',
    detail: 'typed Refs, filters, deterministic output',
    commands: `bun cli search "bridge inspection" --realm demo`,
  },
] as const

export const DEMO_COMMANDS = DEMO_STEPS.map((step) => step.commands).join('\n')

export const DEMO_RESULT = `{
  "results": [{
    "ref": "ctx://<source-id>/tender/DEMO-2026-006",
    "profile": { "id": "ctxindex.demo.tender", "version": 1 },
    "title": "Wireless structural monitoring for river bridges",
    "origin": "local"
  }],
  "warnings": []
}`

export function DemoQuickstart() {
  return (
    <div className="overflow-hidden rounded-ctx-panel border border-[var(--ctx-terminal-muted)] bg-[var(--ctx-terminal)]">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[var(--ctx-terminal-muted)] px-4 py-2 sm:px-6">
        <div className="font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)]">
          <span className="text-[var(--ctx-terminal-foreground)]">
            no-auth demo
          </span>{' '}
          · about a minute, end to end
        </div>
        <CopyButton value={DEMO_COMMANDS} />
      </div>

      <ol className="flex flex-col">
        {DEMO_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="border-b border-[var(--ctx-terminal-muted)] px-4 py-4 sm:px-6"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                aria-hidden
                className="font-mono text-[0.6875rem] text-text-accent"
              >
                {index + 1}
              </span>
              <h3 className="text-sm font-semibold text-[var(--ctx-terminal-foreground)]">
                {step.title}
              </h3>
              <span className="font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)]">
                {step.detail}
              </span>
            </div>
            <CodeHighlight
              code={step.commands}
              lang="sh"
              className="mt-2 pl-5"
            />
          </li>
        ))}
      </ol>

      <div className="px-4 py-4 sm:px-6">
        <div className="font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)]">
          representative result · source id is created locally
        </div>
        <CodeHighlight code={DEMO_RESULT} lang="json" className="mt-2 pl-5" />
      </div>
    </div>
  )
}
