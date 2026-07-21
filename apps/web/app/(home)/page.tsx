import Link from 'next/link'
import { Terminal } from '@/components/terminal'

const principles = [
  {
    number: '01',
    title: 'Scope context before the model sees it',
    body: 'Every Source belongs to one user-created Realm. An explicit Realm filter is exact, so work, personal, and university context stay intentional.',
  },
  {
    number: '02',
    title: 'Use one typed vocabulary',
    body: 'Profiles give mail, Calendar Events, files, and Extension-defined Resources stable shapes, fields, Relations, Artifacts, exports, and Actions.',
  },
  {
    number: '03',
    title: 'Keep providers canonical',
    body: 'Local SQLite projections make discovery fast. Retrieval and narrowly scoped provider operations still flow through the configured Source.',
  },
  {
    number: '04',
    title: 'Stop at reversible work',
    body: 'Typed provider mutations currently create or update email Drafts. Agents can prepare work; ctxindex never sends it.',
  },
] as const

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-border-default">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-10 sm:gap-10 sm:py-14 md:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14 lg:py-20">
          <div className="ctx-fade-up min-w-0">
            <p className="font-mono text-sm text-text-accent">
              local context access for agents
            </p>
            <h1 className="mt-4 max-w-[13ch] text-ctx-display font-bold tracking-ctx-display">
              One typed interface to the context your agent needs
              <span className="text-text-accent">.</span>
            </h1>
            <p className="mt-4 max-w-[34ch] leading-relaxed text-text-secondary sm:hidden">
              A local CLI any shell-capable agent can use over mail, calendars,
              files, and Extension-defined context.
            </p>
            <p className="mt-5 hidden max-w-[62ch] text-lg leading-relaxed text-text-secondary sm:block">
              ctxindex gives any shell-capable agent one local CLI over mail,
              calendars, files, and Extension-defined context. Providers stay
              canonical; commands, JSON, Refs, and exit codes stay consistent.
            </p>

            <div className="mt-5 border-y border-border-default py-3 sm:mt-8 sm:py-4">
              <p className="hidden text-xs font-medium text-text-secondary sm:block">
                Install with Bun 1.3.14 after the first public release
              </p>
              <code className="block overflow-x-auto font-mono text-sm text-text-primary sm:mt-2">
                <span aria-hidden className="mr-2 select-none text-ctx-signal">
                  $
                </span>
                bun add --global ctxindex
              </code>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-6">
              <Link
                href="/docs/start"
                className="ctx-button ctx-button-primary"
              >
                Reach your first result
              </Link>
              <Link
                href="/docs/extend"
                className="ctx-button ctx-button-secondary hidden sm:inline-flex"
              >
                Build an Extension
              </Link>
            </div>
            <p className="mt-4 hidden max-w-[58ch] text-sm leading-relaxed text-text-secondary sm:block">
              No Account or OAuth setup is needed for the first local-directory
              workflow. Source-checkout instructions remain available before the
              npm release.
            </p>
          </div>

          <div className="ctx-fade-up min-w-0 [animation-delay:120ms]">
            <Terminal />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="agent-path"
        className="border-b border-border-default"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-14 md:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-14">
            <div>
              <h2
                id="agent-path"
                className="text-ctx-section font-bold tracking-ctx-heading"
              >
                The shell is the integration
              </h2>
              <p className="mt-4 max-w-[54ch] leading-relaxed text-text-secondary">
                Codex CLI, OpenClaw, Hermes-driven agents, Claude Code, and any
                other code-executing agent already have the required interface.
                There is no MCP server or agent-specific SDK to maintain.
              </p>
              <Link
                href="/docs/start/agent-usage"
                className="ctx-inline-link mt-5 inline-flex min-h-11 items-center text-sm"
              >
                Give ctxindex to an agent →
              </Link>
            </div>

            <ol className="grid border-y border-border-default sm:grid-cols-4 sm:border-x-0">
              {[
                ['01', 'Agent', 'asks for context'],
                ['02', 'CLI', 'scopes and validates'],
                ['03', 'Source', 'owns the operation'],
                ['04', 'Provider', 'remains canonical'],
              ].map(([number, title, body]) => (
                <li
                  key={title}
                  className="grid grid-cols-[2.25rem_1fr] gap-3 border-b border-border-default py-5 last:border-b-0 sm:block sm:border-r sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
                >
                  <span className="font-mono text-xs text-text-accent">
                    {number}
                  </span>
                  <div className="sm:mt-4">
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="starting-points"
        className="border-b border-border-default"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <h2
                id="starting-points"
                className="text-ctx-section font-bold tracking-ctx-heading"
              >
                Start with the context you already have
              </h2>
              <p className="mt-3 max-w-[62ch] leading-relaxed text-text-secondary">
                Prove the local workflow first, connect provider Accounts when
                useful, or add a domain through the same Extension SDK as the
                bundled definitions.
              </p>
            </div>
            <Link
              href="/docs"
              className="ctx-inline-link inline-flex min-h-11 items-center text-sm"
            >
              Browse all documentation →
            </Link>
          </div>

          <div className="mt-10 divide-y divide-border-default border-y border-border-default md:grid md:grid-cols-3 md:divide-y-0 md:divide-x">
            <Link href="/docs/start" className="group block py-7 md:pr-8">
              <p className="font-mono text-xs text-text-accent">no auth</p>
              <h3 className="mt-3 text-lg font-semibold group-hover:text-text-accent">
                Index a local directory
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Initialize, add one Realm and Source, then search a real file.
              </p>
            </Link>
            <Link
              href="/docs/start/connect-provider"
              className="group block py-7 md:px-8"
            >
              <p className="font-mono text-xs text-text-accent">
                optional auth
              </p>
              <h3 className="mt-3 text-lg font-semibold group-hover:text-text-accent">
                Connect Google or Microsoft
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Use an available managed OAuth App or explicit local BYOA.
              </p>
            </Link>
            <Link href="/docs/extend" className="group block py-7 md:pl-8">
              <p className="font-mono text-xs text-text-accent">
                type-safe SDK
              </p>
              <h3 className="mt-3 text-lg font-semibold group-hover:text-text-accent">
                Define new context
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Compose Profiles, Adapters, Providers, Apps, and passive docs.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="product-principles">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] lg:gap-16">
            <div>
              <h2
                id="product-principles"
                className="text-ctx-section font-bold tracking-ctx-heading"
              >
                A context layer, not another inbox
              </h2>
              <p className="mt-4 max-w-[50ch] leading-relaxed text-text-secondary">
                Indexing supports discovery. The product boundary is a coherent,
                governed access model over context that remains where it lives.
              </p>
            </div>
            <ol className="border-t border-border-default">
              {principles.map((principle) => (
                <li
                  key={principle.number}
                  className="grid gap-3 border-b border-border-default py-6 sm:grid-cols-[2.5rem_minmax(0,0.75fr)_minmax(0,1.25fr)] sm:gap-6"
                >
                  <span className="font-mono text-xs text-text-accent">
                    {principle.number}
                  </span>
                  <h3 className="font-semibold">{principle.title}</h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {principle.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  )
}
