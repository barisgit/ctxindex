export const DEMO_VIDEO_SRC: string | null = null
export const DEMO_VIDEO_POSTER: string | undefined = undefined
export const DEMO_VIDEO_CAPTIONS: string | null = null
export const DEMO_VIDEO_READY = Boolean(DEMO_VIDEO_SRC && DEMO_VIDEO_CAPTIONS)

export function DemoVideo() {
  if (!DEMO_VIDEO_SRC || !DEMO_VIDEO_CAPTIONS) return null

  return (
    <video
      className="aspect-video w-full rounded-ctx-panel bg-[var(--ctx-terminal)] object-cover"
      controls
      playsInline
      preload="metadata"
      poster={DEMO_VIDEO_POSTER}
    >
      <source src={DEMO_VIDEO_SRC} />
      <track
        default
        kind="captions"
        label="English"
        src={DEMO_VIDEO_CAPTIONS}
        srcLang="en"
      />
      Your browser does not support embedded video.
    </video>
  )
}
