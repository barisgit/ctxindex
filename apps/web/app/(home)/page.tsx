import Link from 'next/link'
import { Logo } from '@/components/logo'
import { Terminal } from '@/components/terminal'

const features = [
  {
    title: 'One vocabulary, every provider',
    body: 'search, get, thread, export, action. Mail, calendars, files, and extension domains answer to the same commands with the same Ref shapes.',
  },
  {
    title: 'Realms keep contexts apart',
    body: 'personal, company, university. Every Source belongs to exactly one Realm, so agents reason about the right slice of your life.',
  },
  {
    title: 'Built for coding agents',
    body: 'No MCP server or agent-specific SDK. Deterministic commands, --json output, and stable exit codes are the whole integration contract. Any shell-capable agent already integrates.',
  },
  {
    title: 'Providers stay canonical',
    body: 'ctxindex keeps local projections in SQLite for fast search; your mail and files never stop living where they live.',
  },
  {
    title: 'Typed, reversible Actions',
    body: 'Provider mutations stop at reversible email Drafts. Agents can prepare work for you; they never send on your behalf.',
  },
  {
    title: 'Profiles as portable semantics',
    body: 'Versioned domain contracts define shapes, relations, and Actions once — adapters plug providers into them without core branches.',
  },
]

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="ctx-grid-bg relative overflow-hidden border-b border-fd-border">
        <div
          className="ctx-hero-glow pointer-events-none absolute inset-0"
          aria-hidden
        />
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 pt-20 pb-16 md:pt-28">
          <div className="ctx-fade-up flex flex-col items-center text-center">
            <div className="mb-6 flex items-center gap-3">
              <Logo size={56} priority />
            </div>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
              Your context, one command away
              <span className="text-fd-primary">.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-fd-muted-foreground">
              ctxindex is a local personal-context gateway for agents. One
              deterministic CLI to discover, retrieve, and act on your mail,
              calendars, and files — across every account, without giving
              anything up.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/docs/getting-started"
                className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-colors hover:bg-[hsl(38_92%_45%)]"
              >
                Get started
              </Link>
              <Link
                href="/docs"
                className="rounded-lg border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
              >
                Read the docs
              </Link>
            </div>
          </div>
          <div className="ctx-fade-up w-full max-w-3xl [animation-delay:150ms]">
            <Terminal />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
          A context layer, not another inbox
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-fd-muted-foreground">
          Indexing is a strategy, not the product. The product is one coherent
          access model over everything you already have.
        </p>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-fd-background p-6 transition-colors hover:bg-white/[0.04]"
            >
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent integration strip */}
      <section className="border-t border-fd-border bg-fd-card/50">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Zero integration work for agents
            </h2>
            <p className="mt-4 text-fd-muted-foreground">
              Claude Code, Codex CLI, OpenClaw — any agent that can run a shell
              command can use ctxindex today. Compose{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                search
              </code>
              ,{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                get
              </code>
              , and{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                export
              </code>{' '}
              with machine-readable output and stable exit codes. Most commands
              use{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                --json
              </code>
              ; byte-stream exports use{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                --format json
              </code>
              .
            </p>
            <Link
              href="/docs/guides/agent-integration"
              className="mt-6 inline-block text-sm font-semibold text-fd-primary hover:underline"
            >
              Agent integration guide →
            </Link>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-fd-border bg-fd-background p-5 font-mono text-[13px] leading-relaxed">
            <code>{`# what an agent actually runs
ctxindex search "invoice acme" \\
  --realm company --json

ctxindex get \\
  ctx://01J00000000000000000000000/message/stable-message-id \\
  --json

ctxindex action describe \\
  communication.message.draft.create \\
  --source work-mail --json`}</code>
          </pre>
        </div>
      </section>

      {/* Sections roadmap */}
      <section className="border-t border-fd-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-14">
          <p className="mb-6 text-sm font-medium text-fd-muted-foreground">
            Where to go next
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                href: '/docs',
                title: 'Documentation',
                body: 'Concepts, CLI reference, and guides.',
              },
              {
                href: '/docs/examples',
                title: 'Examples',
                body: 'Real sessions and agent workflows.',
              },
              {
                href: '/docs/examples/marketplace',
                title: 'Local Git Catalog',
                body: 'Discover and install trusted Extensions locally.',
              },
            ].map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/50 hover:bg-white/[0.03]"
              >
                <h3 className="font-semibold group-hover:text-fd-primary">
                  {c.title}
                </h3>
                <p className="mt-1 text-sm text-fd-muted-foreground">
                  {c.body}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
