import { AbsoluteFill, Sequence } from 'remotion';
import { Background, FadeOut } from './primitives';
import { Agent, Everywhere, Outro, Protocol, Report, Sources, Tools } from './scenes/index';
import { BEATS, FPS } from './theme';

const beat = (key: keyof typeof BEATS) => ({ from: BEATS[key][0] * FPS, durationInFrames: (BEATS[key][1] - BEATS[key][0]) * FPS });

export function Video() {
  const scenes: Array<[keyof typeof BEATS, React.ComponentType]> = [
    ['everywhere', Everywhere],
    ['sources', Sources],
    ['protocol', Protocol],
    ['agent', Agent],
    ['tools', Tools],
    ['report', Report],
    ['outro', Outro],
  ];
  return (
    <AbsoluteFill>
      <Background />
      {scenes.map(([key, Scene]) => {
        const { from, durationInFrames } = beat(key);
        return (
          <Sequence key={key} from={from} durationInFrames={durationInFrames} name={key}>
            <FadeOut total={durationInFrames} frames={key === 'outro' ? 0 : 10}>
              <Scene />
            </FadeOut>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
