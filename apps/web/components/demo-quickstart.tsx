import { CopyButton } from '@/components/copy-button'

// Launch handoff: replace only these constants when the demo Extension is
// published. The current source-checkout path remains runnable before then.
export const DEMO_EXTENSION_TARGET = './examples/tenders-extension'
export const DEMO_EXTENSION_ID = 'enarocanje.proof'

export const DEMO_COMMANDS = `git clone https://github.com/barisgit/ctxindex.git
cd ctxindex && bun install
bun cli init
bun cli extension install local ${DEMO_EXTENSION_TARGET} ${DEMO_EXTENSION_ID} --json
bun cli realm add demo --name "Demo"
bun cli source add enarocanje.fixture --realm demo --label demo-tenders
bun cli sync --source demo-tenders --json
bun cli search "bridge inspection" --realm demo --json`

export const DEMO_RESULT = `{
  "results": [{
    "ref": "ctx://<source-id>/tender/JN-002%2F2026",
    "profile": {"id": "enarocanje.tender", "version": 1},
    "title": "Municipal bridge inspection"
  }],
  "warnings": []
}`

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto px-5 py-5 font-mono text-xs leading-6 text-[var(--ctx-terminal-foreground)] sm:px-6 sm:text-[0.8125rem]">
      <code>{children}</code>
    </pre>
  )
}

export function DemoQuickstart() {
  return (
    <div className="overflow-hidden rounded-ctx-panel border border-[var(--ctx-terminal-muted)] bg-[var(--ctx-terminal)]">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[var(--ctx-terminal-muted)] px-4 py-2 sm:px-6">
        <div className="font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)]">
          <span className="text-[var(--ctx-terminal-foreground)]">
            no-auth demo · source checkout
          </span>{' '}
          · deterministic fixture data
        </div>
        <CopyButton value={DEMO_COMMANDS} />
      </div>
      <CodeBlock>{DEMO_COMMANDS}</CodeBlock>
      <div className="border-t border-[var(--ctx-terminal-muted)]">
        <div className="px-5 pt-4 font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)] sm:px-6">
          representative result · source id is created locally
        </div>
        <CodeBlock>{DEMO_RESULT}</CodeBlock>
      </div>
    </div>
  )
}
