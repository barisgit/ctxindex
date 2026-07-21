import { Audio, Video } from '@remotion/media'
import {
  AbsoluteFill,
  Easing,
  getStaticFiles,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const FPS = 30
const FADE = 12

const scenes = [
  {
    start: 0,
    end: 15,
    file: '01-hero.mp4',
    step: '01',
    title: 'ctxindex',
    subtitle: 'Context, wherever your agent works.',
  },
  {
    start: 15,
    end: 32,
    file: '02-agent-shell.mp4',
    step: '02',
    title: 'Any agent. One shell.',
    subtitle: 'The CLI is the integration surface.',
    label: 'A CONTEXT LAYER FOR ANY AGENT',
  },
  {
    start: 32,
    end: 88,
    file: '03-hermes.mp4',
    step: '03',
    title: 'Search across accounts',
    subtitle: 'One query. Ranked context. Source citations.',
    label: 'MULTIPLE ACCOUNTS. ONE SEARCH.',
  },
  {
    start: 88,
    end: 102,
    file: '04-draft.mp4',
    step: '04',
    title: 'Safe provider actions',
    subtitle: 'Create a reversible draft, then hand control back.',
    label: 'DRAFT CREATED — NOTHING SENT',
  },
  {
    start: 102,
    end: 120,
    file: '05-trust-catalog.mp4',
    step: '05',
    title: 'Trust you can inspect',
    subtitle: 'Cataloged sources, explicit realms, traceable results.',
  },
  {
    start: 120,
    end: 147,
    file: '06-codex.mp4',
    step: '06',
    title: 'Context for orchestration',
    subtitle: 'Codex and its subagents share the same context layer.',
  },
  {
    start: 147,
    end: 160,
    file: '07-close.mp4',
    step: '07',
    title: 'ctxindex',
    subtitle: 'A context access layer for any agent.',
  },
] as const

const publicFiles = new Set(getStaticFiles().map((file) => file.name))

const Scene = ({ scene }: { scene: (typeof scenes)[number] }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const hasVideo = publicFiles.has(scene.file)

  return (
    <AbsoluteFill style={{ backgroundColor: '#071010', opacity }}>
      {hasVideo ? (
        <Video
          src={staticFile(scene.file)}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            scale: interpolate(frame, [0, durationInFrames], [1.01, 1.035], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.2, 0.7, 0.2, 1),
            }),
          }}
        />
      ) : (
        <Placeholder scene={scene} />
      )}

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(3,9,9,0.08) 35%, rgba(3,9,9,0.82) 100%)',
        }}
      />

      {'label' in scene && scene.label ? (
        <OverlayLabel text={scene.label} />
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: 82,
          bottom: 54,
          display: 'flex',
          alignItems: 'center',
          gap: 17,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: '#ff7139',
            boxShadow: '0 0 24px #ff7139',
          }}
        />
        <div
          style={{
            fontFamily: 'Inter, ui-sans-serif, system-ui',
            color: '#e9f5f1',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          ctxindex
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#69d8c5',
            fontSize: 20,
            opacity: 0.72,
          }}
        >
          {scene.step}/07
        </div>
      </div>
    </AbsoluteFill>
  )
}

const Placeholder = ({ scene }: { scene: (typeof scenes)[number] }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 72% 24%, rgba(31,164,145,0.20), transparent 35%), radial-gradient(circle at 20% 82%, rgba(255,113,57,0.16), transparent 34%), #071010',
        padding: '118px 110px 150px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 1020,
          opacity: interpolate(frame, [4, 24], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: `0 ${interpolate(frame, [4, 24], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px`,
        }}
      >
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#69d8c5',
            fontSize: 28,
            letterSpacing: 3,
            marginBottom: 24,
          }}
        >
          DROP IN {scene.file}
        </div>
        <div
          style={{
            fontFamily: 'Inter, ui-sans-serif, system-ui',
            color: '#f2f7f5',
            fontSize: 96,
            lineHeight: 1.02,
            fontWeight: 760,
            letterSpacing: -4,
          }}
        >
          {scene.title}
        </div>
        <div
          style={{
            fontFamily: 'Inter, ui-sans-serif, system-ui',
            color: '#a9bfba',
            fontSize: 40,
            lineHeight: 1.35,
            marginTop: 28,
            maxWidth: 900,
          }}
        >
          {scene.subtitle}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 110,
          bottom: 118,
          width: 390,
          height: 7,
          background: '#17332f',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${interpolate(frame, [0, 90], [12, 100], { extrapolateRight: 'clamp' })}%`,
            background: 'linear-gradient(90deg, #ff7139, #69d8c5)',
          }}
        />
      </div>
    </AbsoluteFill>
  )
}

const OverlayLabel = ({ text }: { text: string }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [12, 24, 105, 117], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div
      style={{
        position: 'absolute',
        left: 82,
        top: 72,
        maxWidth: 1220,
        padding: '20px 30px',
        borderLeft: '6px solid #ff7139',
        background: 'rgba(5, 16, 15, 0.86)',
        boxShadow: '0 18px 55px rgba(0,0,0,0.35)',
        color: '#f2f7f5',
        fontFamily: 'Inter, ui-sans-serif, system-ui',
        fontSize: 38,
        lineHeight: 1.15,
        fontWeight: 800,
        letterSpacing: 2.4,
        opacity,
        translate: `${interpolate(frame, [12, 24], [-18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px 0`,
      }}
    >
      {text}
    </div>
  )
}

export const SubmissionVideo = () => {
  const hasVoiceWav = publicFiles.has('voiceover.wav')
  const hasVoiceMp3 = publicFiles.has('voiceover.mp3')
  const hasMusic = publicFiles.has('music.mp3')

  return (
    <AbsoluteFill style={{ backgroundColor: '#071010' }}>
      {scenes.map((scene) => (
        <Sequence
          key={scene.file}
          name={`${scene.step} ${scene.title}`}
          from={scene.start * FPS}
          durationInFrames={(scene.end - scene.start) * FPS}
        >
          <Scene scene={scene} />
        </Sequence>
      ))}
      {hasVoiceWav ? (
        <Audio src={staticFile('voiceover.wav')} volume={1} />
      ) : null}
      {!hasVoiceWav && hasVoiceMp3 ? (
        <Audio src={staticFile('voiceover.mp3')} volume={1} />
      ) : null}
      {hasMusic ? (
        <Audio src={staticFile('music.mp3')} volume={0.075} loop />
      ) : null}
    </AbsoluteFill>
  )
}
