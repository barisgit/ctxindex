import { ImageResponse } from 'next/og'

export const alt = 'ctxindex — one local typed CLI for agent context'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'stretch',
        background: '#121719',
        color: '#e6ecef',
        display: 'flex',
        height: '100%',
        padding: '76px 84px',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 20 }}>
          <svg
            aria-label="ctxindex mark"
            height="68"
            role="img"
            viewBox="0 0 100 100"
            width="68"
          >
            <path
              d="M49 18H35Q18 18 18 35V47"
              fill="none"
              stroke="#d8e1e9"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="8"
            />
            <path
              d="M18 68Q18 82 35 82H65Q82 82 82 65V50"
              fill="none"
              stroke="#43515c"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="8"
            />
            <circle cx="82" cy="18" fill="#f5a30b" r="6.5" />
            <rect fill="#d8e1e9" height="6" rx="3" width="22" x="39" y="43" />
            <rect fill="#71808c" height="6" rx="3" width="16" x="39" y="53" />
          </svg>
          <span style={{ fontSize: 38, fontWeight: 700 }}>ctxindex</span>
          <span style={{ color: '#f5b843', fontSize: 38 }}>·</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              color: '#f5b843',
              fontFamily: 'monospace',
              fontSize: 22,
              marginBottom: 24,
            }}
          >
            local typed context for agents
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 750,
              letterSpacing: '-0.035em',
              lineHeight: 1.04,
              maxWidth: 930,
            }}
          >
            One local CLI for all the context your agents use.
          </div>
        </div>
      </div>
    </div>,
    size,
  )
}
