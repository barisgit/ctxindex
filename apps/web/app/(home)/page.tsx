import Link from 'next/link'
import { DemoQuickstart } from '@/components/demo-quickstart'
import { DEMO_VIDEO_READY, DemoVideo } from '@/components/demo-video'

const contextKinds = [
  ['mail', 'communication.message'],
  ['calendars', 'calendar.event'],
  ['files', 'file'],
  ['Extensions', 'your.profile'],
] as const

const trustBoundaries = [
  {
    title: 'Providers stay canonical',
    body: 'ctxindex keeps a local, purgeable materialization for fast discovery. Mail, Calendar Events, and files remain in the systems that own them.',
  },
  {
    title: 'Access stays explicit',
    body: 'Every Source belongs to a user-created Realm. Accounts, permissions, and provider operations remain bound to the configured Source.',
  },
  {
    title: 'Actions stay narrow',
    body: 'Typed provider mutations currently stop at reversible email Draft create and update. ctxindex never sends mail.',
  },
] as const

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-border-default">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 md:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-center lg:gap-16 lg:py-24">
          <div className="ctx-fade-up min-w-0">
            <p className="font-mono text-sm text-text-accent">
              local typed context for agents
            </p>
            <h1 className="mt-4 max-w-[14ch] text-ctx-display font-bold tracking-ctx-display">
              One local CLI for all the context your agents use
              <span className="text-text-accent">.</span>
            </h1>
            <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-text-secondary sm:mt-6">
              Search and retrieve across mail, calendars, files, and
              Extension-defined context through deterministic commands. Any
              shell-capable agent can use them.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#try" className="ctx-button ctx-button-primary">
                Try the no-auth demo
              </a>
              <Link href="/docs" className="ctx-button ctx-button-secondary">
                Read the docs
              </Link>
            </div>
            <p className="mt-4 hidden max-w-[58ch] text-sm leading-relaxed text-text-secondary sm:block">
              Local-first. Stable Refs. Machine-readable output. No MCP server
              or agent-specific integration layer.
            </p>
          </div>

          <div className="ctx-fade-up min-w-0 [animation-delay:120ms]">
            <div className="hidden border-y border-border-default sm:block">
              {contextKinds.map(([label, profile]) => (
                <div
                  key={label}
                  className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-5 border-b border-border-default py-3 last:border-b-0"
                >
                  <span className="font-medium">{label}</span>
                  <code className="font-mono text-xs text-text-secondary">
                    {profile}
                  </code>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-3 font-mono text-xs leading-relaxed">
              <span aria-hidden className="text-text-accent">
                $
              </span>
              <code className="min-w-0 text-text-primary">
                ctxindex search &quot;Aurora kickoff&quot; --realm work --kind
                file --format json
              </code>
            </div>
            <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-border-default pt-3 font-mono text-xs leading-relaxed">
              <span className="text-text-secondary">1 result</span>
              <code className="min-w-0 truncate text-right text-text-primary">
                ctx://…/file/aurora.txt · aurora.txt
              </code>
            </div>
          </div>
        </div>
      </section>

      <section id="try" aria-labelledby="try-heading" className="scroll-mt-16">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)] lg:gap-16">
            <div>
              <h2
                id="try-heading"
                className="text-ctx-section font-bold tracking-ctx-heading"
              >
                From install to a real result, without OAuth
              </h2>
              <p className="mt-4 max-w-[52ch] leading-relaxed text-text-secondary">
                The checked demo Extension contains deterministic
                public-procurement data. Install it from the source checkout,
                create one Realm and Source, sync, then search the same typed
                Resource an agent would receive.
              </p>
              <p className="mt-5 text-sm leading-relaxed text-text-secondary">
                Requires Bun 1.3.14. The demo makes no provider request and
                creates no Account or Grant.
              </p>
              <Link
                href="/docs/start"
                className="ctx-inline-link mt-5 inline-flex min-h-11 items-center text-sm"
              >
                Follow the guided quickstart →
              </Link>
            </div>
            <DemoQuickstart />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="agents-heading"
        className="border-y border-border-default bg-background-secondary"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 md:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2
              id="agents-heading"
              className="text-ctx-section font-bold tracking-ctx-heading"
            >
              If an agent can run a shell command, it can use ctxindex
            </h2>
            <p className="mt-4 max-w-[60ch] leading-relaxed text-text-secondary">
              Codex CLI, Claude Code, OpenClaw, and other code-executing agents
              compose the same commands you do. JSON and stable exit codes form
              the contract; generated CLI reference provides the exact surface.
            </p>
            <Link
              href="/docs/start/agent-usage"
              className="ctx-inline-link mt-5 inline-flex min-h-11 items-center text-sm"
            >
              Set up agent usage →
            </Link>
          </div>
          <div className="min-w-0 border-y border-border-default py-5">
            <p className="text-sm font-medium">
              Give your agent one instruction
            </p>
            <blockquote className="mt-4 max-w-[62ch] text-lg leading-relaxed text-text-primary">
              “Use ctxindex to search the work Realm. Pass returned{' '}
              <code className="font-mono text-[0.85em] text-text-accent">
                ctx://
              </code>{' '}
              Refs through unchanged, and retrieve only the result you need.”
            </blockquote>
            <code className="mt-5 block overflow-x-auto whitespace-nowrap bg-background-muted px-4 py-3 font-mono text-xs text-text-primary">
              ctxindex search &quot;FedEx invoice&quot; --realm work --format
              json
            </code>
          </div>
        </div>
      </section>

      <section aria-labelledby="trust-heading">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-16">
            <div>
              <h2
                id="trust-heading"
                className="text-ctx-section font-bold tracking-ctx-heading"
              >
                Local access without taking ownership of your context
              </h2>
              <p className="mt-4 max-w-[52ch] leading-relaxed text-text-secondary">
                ctxindex is a gateway over the places where your context already
                lives, with explicit boundaries an operator can inspect.
              </p>
              <Link
                href="/docs/use/trust"
                className="ctx-inline-link mt-5 inline-flex min-h-11 items-center text-sm"
              >
                Read the trust model →
              </Link>
            </div>
            <div className="border-t border-border-default">
              {trustBoundaries.map((boundary) => (
                <article
                  key={boundary.title}
                  className="grid gap-2 border-b border-border-default py-6 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)] sm:gap-8"
                >
                  <h3 className="font-semibold">{boundary.title}</h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {boundary.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="extensions-heading"
        className="border-y border-border-default"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 md:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16">
          <div className="min-w-0 overflow-hidden rounded-ctx-surface bg-[var(--ctx-terminal)] px-5 py-5 sm:px-6">
            <pre className="overflow-x-auto font-mono text-xs leading-6 text-[var(--ctx-terminal-foreground)]">
              <code>{`export default defineExtension({
  id: 'acme.context',
  adapters: [notesAdapter],
  docs: docs('./docs'),
})`}</code>
            </pre>
          </div>
          <div>
            <h2
              id="extensions-heading"
              className="text-ctx-section font-bold tracking-ctx-heading"
            >
              New context uses the same type-safe Extension SDK
            </h2>
            <p className="mt-4 max-w-[58ch] leading-relaxed text-text-secondary">
              Define Profiles, Source Adapters, Providers, OAuth Apps, and
              passive documentation as ordinary typed values. Providerless
              Adapters need no authentication or synthetic Provider.
            </p>
            <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-text-secondary">
              Extensions are trusted in-process code. Install only packages you
              trust; they are not sandboxed plugins.
            </p>
            <Link
              href="/docs/extend"
              className="ctx-button ctx-button-secondary mt-6"
            >
              Build an Extension
            </Link>
          </div>
        </div>
      </section>

      {DEMO_VIDEO_READY ? (
        <section aria-labelledby="video-heading">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-16 md:py-24 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)] lg:items-center lg:gap-16">
            <div>
              <h2
                id="video-heading"
                className="text-ctx-section font-bold tracking-ctx-heading"
              >
                See the complete path
              </h2>
              <p className="mt-4 max-w-[48ch] leading-relaxed text-text-secondary">
                Watch the published CLI move from install to a typed result,
                then hand the Ref to an agent.
              </p>
            </div>
            <DemoVideo />
          </div>
        </section>
      ) : null}
    </div>
  )
}
