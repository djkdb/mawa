import { Chrome } from './components/Chrome.js';
import { Slide } from './components/Slide.js';
import { useDeck } from './lib/useDeck.js';
import { NetworkScene, type SceneMode } from './scenes/NetworkScene.js';
import { About, Architecture, AxThinking, Final, Hero, Learnings, LiveDemo, McpExplorer, Problem, Solution } from './slides/content.js';

const TITLES = ['Hero', 'Problem', 'Solution', 'Architecture', 'Live demo', 'MCP explorer', 'AX thinking', 'Learnings', 'About', 'Final'];
const SCENE_BY_SLIDE: SceneMode[] = ['network', 'scattered', 'converge', 'ambient', 'ambient', 'ambient', 'ambient', 'ambient', 'ambient', 'converge'];

export default function App() {
  const { ref, index, go, presenting, togglePresenting } = useDeck(TITLES.length);
  const dim = index >= 3;
  return (
    <>
      <NetworkScene mode={SCENE_BY_SLIDE[index] ?? 'ambient'} dim={dim} />
      <Chrome index={index} total={TITLES.length} presenting={presenting} onPrev={() => go(index - 1)} onNext={() => go(index + 1)} onToggle={() => void togglePresenting()} titles={TITLES} />
      <main ref={ref} className="deck relative z-10">
        <Slide id="hero" active={index === 0}><Hero onExplore={() => go(1)} /></Slide>
        <Slide id="problem" active={index === 1}><Problem /></Slide>
        <Slide id="solution" active={index === 2}><Solution /></Slide>
        <Slide id="architecture" active={index === 3}><Architecture /></Slide>
        <Slide id="demo" active={index === 4}><LiveDemo active={index === 4} /></Slide>
        <Slide id="mcp" active={index === 5}><McpExplorer /></Slide>
        <Slide id="ax" active={index === 6}><AxThinking /></Slide>
        <Slide id="learnings" active={index === 7}><Learnings /></Slide>
        <Slide id="about" active={index === 8}><About /></Slide>
        <Slide id="final" active={index === 9}><Final /></Slide>
      </main>
    </>
  );
}
