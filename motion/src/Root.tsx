import { Composition } from 'remotion';
import { DURATION_SEC, FPS, HEIGHT, WIDTH } from './theme';
import { Video } from './Video';

export function Root() {
  return <Composition id="MyAIWorkAgent" component={Video} durationInFrames={DURATION_SEC * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />;
}
