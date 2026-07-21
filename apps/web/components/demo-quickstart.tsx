import { CodeHighlight } from '@/components/code-highlight'
import { CopyButton } from '@/components/copy-button'

export const DEMO_EXTENSION_TARGET =
  'git+https://github.com:443/barisgit/ctxindex-extensions.git#main'
export const DEMO_EXTENSION_ID = 'barisgit.github-issues'

const DEMO_STEPS = [
  {
    title: 'Get the code',
    detail: 'Bun 1.3.14 · published CLI, no checkout',
    commands: `bun add --global ctxindex
ctxindex init`,
  },
  {
    title: 'Install the demo Extension',
    detail: 'standalone public repo · pinned Git commit',
    commands: `ctxindex extension install git \\
  '${DEMO_EXTENSION_TARGET}' \\
  ${DEMO_EXTENSION_ID}`,
  },
  {
    title: 'Create a Realm, add the Source, sync',
    detail: 'public GitHub data · no OAuth or secrets',
    commands: `ctxindex realm add demo --name "Demo"
ctxindex source add github.issues --realm demo --label gh-issues \\
  --config-owner barisgit --config-repository ctxindex
ctxindex sync --source gh-issues`,
  },
  {
    title: 'Search it like an agent would',
    detail: 'typed Refs, filters, agent-efficient JSON',
    commands: `ctxindex search issue --source gh-issues --local-only --format json`,
  },
] as const

export const DEMO_COMMANDS = DEMO_STEPS.map((step) => step.commands).join('\n')

export const DEMO_RESULT = `{
  "results": [{
    "ref": "ctx://<source-id>/issue/84",
    "profile": { "id": "software.issue", "version": 1 },
    "title": "Ship the portable Agent Skill",
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
