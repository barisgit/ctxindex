import { Composition } from 'remotion'
import { SubmissionVideo } from './SubmissionVideo'

export const RemotionRoot = () => (
  <Composition
    id="CtxindexSubmission"
    component={SubmissionVideo}
    durationInFrames={160 * 30}
    fps={30}
    width={1920}
    height={1080}
  />
)
