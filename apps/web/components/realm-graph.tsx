'use client'

import { Bot, FileText, Puzzle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { brandPaths } from '@/components/brand-paths'
import { Logo } from '@/components/logo'

type Source = {
  label: string
  auth: 'google oauth' | 'custom oauth' | 'no auth'
  kind: string
  brand?: keyof typeof brandPaths
  lucide?: 'file' | 'puzzle'
  extension?: boolean
}

type Realm = {
  name: string
  sources: Source[]
}

const realms: Realm[] = [
  {
    name: 'personal',
    sources: [
      {
        label: 'Gmail',
        auth: 'google oauth',
        kind: 'mail.message',
        brand: 'gmail',
      },
      {
        label: 'Calendar',
        auth: 'google oauth',
        kind: 'calendar.event',
        brand: 'googlecalendar',
      },
      {
        label: 'Local directory',
        auth: 'no auth',
        kind: 'file',
        lucide: 'file',
      },
    ],
  },
  {
    name: 'work',
    sources: [
      {
        label: 'Gmail',
        auth: 'google oauth',
        kind: 'mail.message',
        brand: 'gmail',
      },
      {
        label: 'Drive extension',
        auth: 'google oauth',
        kind: 'file',
        brand: 'googledrive',
        extension: true,
      },
      {
        label: 'issues extension',
        auth: 'custom oauth',
        kind: 'issue.ticket',
        lucide: 'puzzle',
        extension: true,
      },
      {
        label: 'Local directory',
        auth: 'no auth',
        kind: 'file',
        lucide: 'file',
      },
    ],
  },
  {
    name: 'demo',
    sources: [
      {
        label: 'tenders extension',
        auth: 'no auth',
        kind: 'tender.notice',
        lucide: 'puzzle',
        extension: true,
      },
    ],
  },
]

const realmColors: Record<string, string> = {
  personal: 'oklch(74% 0.1 195)',
  work: 'oklch(77.75% 0.1641 72.8)',
  demo: 'oklch(72% 0.11 305)',
}

type QueryStep = {
  type: 'query'
  q: string
  flag?: { name: '--realm' | '--kind' | '--local-only'; value: string }
  extra?: string
  localOnly?: boolean
  agent: number
  client?: number
  matches: (realmName: string, source: Source) => boolean
}

type ActionStep = {
  type: 'action'
  command: string
  note: string
  agent: number
  client?: number
  target: { realm: string; source: string }
}

type SyncStep = { type: 'sync' }

type Step = QueryStep | ActionStep | SyncStep

const sync: SyncStep = { type: 'sync' }

// One sync breather closes each loop; command order is shuffled across
// realms, kinds, agents, custom clients, an Action, and a --local-only lookup.
const steps: Step[] = [
  {
    type: 'query',
    q: 'invoice',
    flag: { name: '--realm', value: 'work' },
    extra: '--since 2026-04-01',
    agent: 0,
    matches: (realmName) => realmName === 'work',
  },
  {
    type: 'query',
    q: 'dentist appointment',
    flag: { name: '--realm', value: 'personal' },
    agent: 2,
    client: 0,
    matches: (realmName) => realmName === 'personal',
  },
  {
    type: 'query',
    q: 'quarterly sync',
    flag: { name: '--kind', value: 'mail.message' },
    extra: '--limit 5',
    agent: 1,
    matches: (_realmName, source) => source.kind === 'mail.message',
  },
  {
    type: 'action',
    command: 'ctxindex action mail.draft.create --source work-gmail',
    note: 'draft only · nothing sent',
    agent: 0,
    target: { realm: 'work', source: 'Gmail' },
  },
  {
    type: 'query',
    q: 'flight to berlin',
    agent: 1,
    matches: () => true,
  },
  {
    type: 'query',
    q: 'PO-2231',
    flag: { name: '--local-only', value: '' },
    localOnly: true,
    agent: 2,
    client: 1,
    matches: () => false,
  },
  {
    type: 'query',
    q: 'bridge inspection',
    flag: { name: '--realm', value: 'demo' },
    agent: 2,
    matches: (realmName) => realmName === 'demo',
  },
  sync,
]

const agents = [
  { label: 'Claude Code', brand: 'anthropic' as const },
  { label: 'Codex CLI', brand: 'openai' as const },
  { label: 'Any agent', brand: undefined },
]

const futureClients = ['Web app', 'Desktop app', 'MCP server']

const VIEW_W = 1160
const VIEW_H = 660
const CX = 620
const CY = VIEW_H / 2
const FRAME_X = 8
const FRAME_W = 300
const CHIP_H = 44
const CHIP_GAP = 10
const FRAME_PAD_TOP = 40
const FRAME_PAD_BOTTOM = 14
const FRAME_GAP = 22
const AGENT_X = VIEW_W - 232
const AGENT_W = 224
const AGENT_H = 48
const AGENT_GAP = 16
const QUERY_MS = 4200
const SYNC_MS = 2400

function frameHeight(realm: Realm): number {
  return (
    FRAME_PAD_TOP +
    realm.sources.length * CHIP_H +
    (realm.sources.length - 1) * CHIP_GAP +
    FRAME_PAD_BOTTOM
  )
}

const totalFrames = realms.reduce((sum, realm) => sum + frameHeight(realm), 0)
const framesTop = (VIEW_H - totalFrames - FRAME_GAP * (realms.length - 1)) / 2

function frameTop(index: number): number {
  let y = framesTop
  for (let i = 0; i < index; i += 1) {
    y += frameHeight(realms[i]) + FRAME_GAP
  }
  return y
}

const agentsBlockH = agents.length * AGENT_H + (agents.length - 1) * AGENT_GAP
const rpcFrameH =
  FRAME_PAD_TOP +
  futureClients.length * CHIP_H +
  (futureClients.length - 1) * CHIP_GAP +
  FRAME_PAD_BOTTOM
const rightTop = (VIEW_H - (agentsBlockH + 30 + rpcFrameH)) / 2
const rpcFrameTop = rightTop + agentsBlockH + 30

function beam(x0: number, y0: number, x1: number, y1: number): string {
  const mx = (x0 + x1) / 2
  return `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`
}

function SourceIcon({
  source,
  x,
  y,
}: {
  source: Source
  x: number
  y: number
}) {
  if (source.brand) {
    return (
      <g transform={`translate(${x}, ${y}) scale(0.75)`} aria-hidden>
        <path d={brandPaths[source.brand]} className="fill-text-secondary" />
      </g>
    )
  }
  const Icon = source.lucide === 'puzzle' ? Puzzle : FileText
  return (
    <Icon
      size={18}
      x={x}
      y={y}
      strokeWidth={1.75}
      className="stroke-text-secondary"
      aria-hidden
    />
  )
}

export function RealmGraph() {
  const [stepIndex, setStepIndex] = useState(0)
  const [hold, setHold] = useState(false)
  const [animate, setAnimate] = useState(true)

  const step = steps[stepIndex]
  const query = step.type === 'query' ? step : null
  const action = step.type === 'action' ? step : null
  const localOnly = query?.localOnly === true
  const issuerClient = (query ?? action)?.client ?? null

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimate(false)
      return
    }
    const base = steps[stepIndex].type === 'sync' ? SYNC_MS : QUERY_MS
    const timer = setTimeout(
      () => {
        setHold(false)
        setStepIndex((value) => (value + 1) % steps.length)
      },
      hold ? base * 2.5 : base,
    )
    return () => clearTimeout(timer)
  }, [stepIndex, hold])

  const flagRealmColor = action
    ? realmColors[action.target.realm]
    : query?.flag?.name === '--realm'
      ? realmColors[query.flag.value]
      : undefined
  const issuerColor = flagRealmColor ?? 'var(--ctx-signal)'

  const sourceActive = (realmName: string, source: Source): boolean => {
    if (action) {
      return (
        action.target.realm === realmName &&
        action.target.source === source.label
      )
    }
    if (query) return query.matches(realmName, source)
    return true // sync: everything lit
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Sources grouped into personal, work, and demo Realms sync into the local ctxindex daemon; agents search it, run typed Actions back toward providers, and web, desktop, or MCP clients can build on the included RPC client"
        className="h-auto w-full"
      >
        {/* source beams */}
        {realms.map((realm, realmIndex) => {
          const realmColor = realmColors[realm.name]
          const top = frameTop(realmIndex)
          return realm.sources.map((source, i) => {
            const active = sourceActive(realm.name, source)
            const isActionTarget =
              action != null &&
              action.target.realm === realm.name &&
              action.target.source === source.label
            const y = top + FRAME_PAD_TOP + i * (CHIP_H + CHIP_GAP) + CHIP_H / 2
            const d = beam(FRAME_X + FRAME_W, y, CX - 62, CY)
            // Actions push outward: daemon -> provider.
            const motionPath = isActionTarget
              ? beam(CX - 62, CY, FRAME_X + FRAME_W, y)
              : d
            return (
              <g key={realm.name + source.label}>
                <path
                  d={d}
                  fill="none"
                  className="transition-all duration-700"
                  stroke={active ? realmColor : 'var(--color-border-default)'}
                  strokeWidth="1.25"
                  strokeDasharray={source.extension ? '5 5' : undefined}
                  opacity={active ? 0.9 : 0.22}
                />
                {animate ? (
                  <g
                    className="transition-opacity duration-700"
                    opacity={active ? 1 : 0}
                  >
                    <circle r="3.5" fill={realmColor}>
                      <animateMotion
                        dur="2.6s"
                        begin={`${(realmIndex * 3 + i) * 0.45}s`}
                        repeatCount="indefinite"
                        path={motionPath}
                      />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0"
                        keyTimes="0;0.12;0.85;1"
                        dur="2.6s"
                        begin={`${(realmIndex * 3 + i) * 0.45}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                ) : null}
              </g>
            )
          })
        })}

        {/* agent beams */}
        {agents.map((agent, i) => {
          const isIssuer =
            issuerClient == null && (query ?? action)?.agent === i
          const y = rightTop + i * (AGENT_H + AGENT_GAP) + AGENT_H / 2
          const d = beam(CX + 62, CY, AGENT_X, y)
          // During an action the agent pushes toward the daemon.
          const motionPath = action ? beam(AGENT_X, y, CX + 62, CY) : d
          return (
            <g key={agent.label}>
              <path
                d={d}
                fill="none"
                className="transition-all duration-700"
                stroke={isIssuer ? issuerColor : 'var(--color-border-default)'}
                strokeWidth="1.25"
                opacity={isIssuer ? 0.9 : 0.35}
              />
              {animate && isIssuer ? (
                <circle r="3.5" fill={issuerColor}>
                  <animateMotion
                    dur="1.8s"
                    repeatCount="indefinite"
                    path={motionPath}
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.12;0.85;1"
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
            </g>
          )
        })}

        {/* future client beams */}
        {futureClients.map((label, i) => {
          const isIssuer = issuerClient === i
          const y =
            rpcFrameTop + FRAME_PAD_TOP + i * (CHIP_H + CHIP_GAP) + CHIP_H / 2
          const d = beam(CX + 62, CY, AGENT_X + 14, y)
          const motionPath = action ? beam(AGENT_X + 14, y, CX + 62, CY) : d
          return (
            <g key={label}>
              <path
                d={d}
                fill="none"
                className="transition-all duration-700"
                stroke={isIssuer ? issuerColor : 'var(--color-border-default)'}
                strokeWidth="1.25"
                strokeDasharray="5 5"
                opacity={isIssuer ? 0.9 : 0.5}
              />
              {animate && isIssuer ? (
                <circle r="3.5" fill={issuerColor}>
                  <animateMotion
                    dur="1.8s"
                    repeatCount="indefinite"
                    path={motionPath}
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.12;0.85;1"
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
            </g>
          )
        })}

        {/* realm frames + source chips */}
        {realms.map((realm, realmIndex) => {
          const top = frameTop(realmIndex)
          const height = frameHeight(realm)
          const realmColor = realmColors[realm.name]
          const realmSelected =
            (query?.flag?.name === '--realm' &&
              query.flag.value === realm.name) ||
            action?.target.realm === realm.name
          const anyActive = realm.sources.some((source) =>
            sourceActive(realm.name, source),
          )
          return (
            <g
              key={realm.name}
              className="transition-opacity duration-700"
              opacity={anyActive ? 1 : 0.35}
            >
              <rect
                x={FRAME_X}
                y={top}
                width={FRAME_W}
                height={height}
                rx={16}
                fill={realmSelected ? realmColor : 'none'}
                fillOpacity={realmSelected ? 0.05 : 0}
                className="transition-all duration-700"
                stroke={realmSelected ? realmColor : 'var(--ctx-frame)'}
                strokeWidth="1.25"
                strokeDasharray="6 5"
              />
              <text
                x={FRAME_X + 18}
                y={top + 25}
                fill={
                  realmSelected ? realmColor : 'var(--color-text-secondary)'
                }
                className="transition-all duration-700"
                fontSize="12"
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {realm.name}
              </text>
              {realm.sources.map((source, i) => {
                const y = top + FRAME_PAD_TOP + i * (CHIP_H + CHIP_GAP)
                const active = sourceActive(realm.name, source)
                const isActionTarget =
                  action != null &&
                  action.target.realm === realm.name &&
                  action.target.source === source.label
                const chipSelected =
                  (active && query?.flag?.name === '--kind') || isActionTarget
                return (
                  <g
                    key={`${realm.name}-${source.label}`}
                    className="transition-opacity duration-700"
                    opacity={active ? 1 : 0.45}
                  >
                    <rect
                      x={FRAME_X + 14}
                      y={y}
                      width={FRAME_W - 28}
                      height={CHIP_H}
                      rx={10}
                      className="fill-background-secondary transition-all duration-700"
                      stroke={
                        chipSelected
                          ? realmColor
                          : 'var(--color-border-default)'
                      }
                      strokeWidth="1"
                      strokeDasharray={source.extension ? '5 4' : undefined}
                    />
                    <SourceIcon
                      source={source}
                      x={FRAME_X + 28}
                      y={y + (CHIP_H - 18) / 2}
                    />
                    <text
                      x={FRAME_X + 58}
                      y={y + 27}
                      className="fill-text-primary"
                      fontSize="13"
                      fontWeight="600"
                      fontFamily="var(--font-sans)"
                    >
                      {source.label}
                    </text>
                    <text
                      x={FRAME_X + FRAME_W - 26}
                      y={y + 27}
                      textAnchor="end"
                      className="fill-text-secondary"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                    >
                      {source.auth}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* center node */}
        <circle
          cx={CX}
          cy={CY}
          r={56}
          fill="none"
          className="ctx-graph-ring stroke-ctx-signal"
          strokeWidth="1"
        />
        <circle
          cx={CX}
          cy={CY}
          r={64}
          fill="none"
          className="transition-opacity duration-700 stroke-ctx-signal"
          strokeWidth="1.25"
          strokeDasharray="3 5"
          opacity={localOnly ? 0.9 : 0}
        />
        <circle
          cx={CX}
          cy={CY}
          r={56}
          className="fill-background-primary stroke-border-default"
          strokeWidth="1"
        />
        <g transform={`translate(${CX - 34}, ${CY - 34})`}>
          <Logo size={68} label={null} />
        </g>
        <text
          x={CX}
          y={CY + 80}
          textAnchor="middle"
          className="fill-text-primary"
          fontSize="13.5"
          fontWeight="600"
          fontFamily="var(--font-mono)"
        >
          ctxindex
        </text>
        <text
          x={CX}
          y={CY + 98}
          textAnchor="middle"
          className={localOnly ? 'fill-text-accent' : 'fill-text-secondary'}
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          local index · remote search
        </text>

        {/* agent chips */}
        {agents.map((agent, i) => {
          const isIssuer =
            issuerClient == null && (query ?? action)?.agent === i
          const y = rightTop + i * (AGENT_H + AGENT_GAP)
          return (
            <g
              key={agent.label}
              className="transition-opacity duration-700"
              opacity={isIssuer || step.type === 'sync' ? 1 : 0.55}
            >
              <rect
                x={AGENT_X}
                y={y}
                width={AGENT_W}
                height={AGENT_H}
                rx={12}
                className="fill-background-secondary transition-all duration-700"
                stroke={isIssuer ? issuerColor : 'var(--color-border-default)'}
                strokeWidth="1"
              />
              {agent.brand ? (
                <g
                  transform={`translate(${AGENT_X + 16}, ${y + (AGENT_H - 18) / 2}) scale(0.75)`}
                  aria-hidden
                >
                  <path
                    d={brandPaths[agent.brand]}
                    className="fill-text-secondary"
                  />
                </g>
              ) : (
                <Bot
                  size={18}
                  x={AGENT_X + 16}
                  y={y + (AGENT_H - 18) / 2}
                  strokeWidth={1.75}
                  className="stroke-text-secondary"
                  aria-hidden
                />
              )}
              <text
                x={AGENT_X + 46}
                y={y + 29}
                className="fill-text-primary"
                fontSize="13"
                fontWeight="600"
                fontFamily="var(--font-sans)"
              >
                {agent.label}
              </text>
              <text
                x={AGENT_X + AGENT_W - 16}
                y={y + 29}
                textAnchor="end"
                className="fill-text-secondary"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                cli
              </text>
            </g>
          )
        })}

        {/* future clients frame */}
        <rect
          x={AGENT_X - 14}
          y={rpcFrameTop}
          width={AGENT_W + 22}
          height={rpcFrameH}
          rx={16}
          fill="none"
          className="stroke-ctx-frame"
          strokeWidth="1.25"
          strokeDasharray="6 5"
          opacity={0.8}
        />
        <text
          x={AGENT_X + 4}
          y={rpcFrameTop + 25}
          className="fill-text-secondary"
          fontSize="12"
          fontWeight="600"
          fontFamily="var(--font-mono)"
        >
          yours to build
        </text>
        {futureClients.map((label, i) => {
          const isIssuer = issuerClient === i
          const y = rpcFrameTop + FRAME_PAD_TOP + i * (CHIP_H + CHIP_GAP)
          return (
            <g
              key={label}
              className="transition-opacity duration-700"
              opacity={isIssuer ? 1 : 0.8}
            >
              <rect
                x={AGENT_X}
                y={y}
                width={AGENT_W - 6}
                height={CHIP_H}
                rx={10}
                className="fill-background-primary transition-all duration-700"
                stroke={isIssuer ? issuerColor : 'var(--color-border-default)'}
                strokeWidth="1"
                strokeDasharray="5 4"
              />
              <text
                x={AGENT_X + 16}
                y={y + 27}
                className="fill-text-secondary"
                fontSize="13"
                fontWeight="600"
                fontFamily="var(--font-sans)"
              >
                {label}
              </text>
              <text
                x={AGENT_X + AGENT_W - 22}
                y={y + 27}
                textAnchor="end"
                className="fill-text-secondary"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                rpc client
              </text>
            </g>
          )
        })}
      </svg>

      <figcaption className="mt-6 flex flex-col items-center gap-2">
        <div
          key={stepIndex}
          className="ctx-morph-swap flex min-h-6 flex-wrap items-baseline justify-center gap-x-2 font-mono text-xs sm:text-sm"
        >
          {action ? (
            <>
              <span aria-hidden className="text-text-secondary">
                {action.client != null
                  ? futureClients[action.client]
                  : agents[action.agent].label}{' '}
                ›
              </span>
              <span className="text-text-primary">{action.command}</span>
              <span style={{ color: issuerColor }}>{action.note}</span>
            </>
          ) : query ? (
            <>
              <span aria-hidden className="text-text-secondary">
                {query.client != null
                  ? futureClients[query.client]
                  : agents[query.agent].label}{' '}
                ›
              </span>
              <span className="text-text-primary">
                ctxindex search &quot;{query.q}&quot;
              </span>
              {query.flag ? (
                <span style={{ color: issuerColor }}>
                  {query.flag.value
                    ? `${query.flag.name} ${query.flag.value}`
                    : query.flag.name}
                </span>
              ) : (
                <span className="text-text-secondary">(every realm)</span>
              )}
              {query.extra ? (
                <span className="text-text-secondary">{query.extra}</span>
              ) : null}
            </>
          ) : (
            <span className="text-text-secondary">
              sync · every Source → local index
            </span>
          )}
        </div>
        <p className="text-sm text-text-secondary">
          Synced to a local index, searched live when you need it — your grants
          stay on your machine.
        </p>
        <div className="mt-1 flex items-center justify-center gap-2.5">
          {steps.map((dotStep, index) => {
            const isCurrent = index === stepIndex
            const isSync = dotStep.type === 'sync'
            const dotColor =
              dotStep.type === 'action'
                ? realmColors[dotStep.target.realm]
                : dotStep.type === 'query' && dotStep.flag?.name === '--realm'
                  ? realmColors[dotStep.flag.value]
                  : 'var(--ctx-signal)'
            return (
              <button
                key={
                  dotStep.type === 'query'
                    ? `q-${dotStep.q}`
                    : dotStep.type === 'action'
                      ? `a-${dotStep.command}`
                      : 'sync'
                }
                type="button"
                aria-label={
                  isSync
                    ? `Show sync pause ${index + 1}`
                    : `Show step ${index + 1}`
                }
                aria-current={isCurrent}
                onClick={() => {
                  setStepIndex(index)
                  setHold(true)
                }}
                className="flex size-6 items-center justify-center"
              >
                {isSync ? (
                  <span
                    className="size-1.5 rounded-full border transition-all duration-300"
                    style={{
                      borderColor: isCurrent
                        ? 'var(--ctx-signal)'
                        : 'var(--color-border-default)',
                      backgroundColor: 'transparent',
                      transform: isCurrent ? 'scale(1.35)' : 'scale(1)',
                    }}
                  />
                ) : (
                  <span
                    className="size-2 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: isCurrent
                        ? dotColor
                        : 'var(--color-border-default)',
                      transform: isCurrent ? 'scale(1.35)' : 'scale(1)',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </figcaption>
    </figure>
  )
}
