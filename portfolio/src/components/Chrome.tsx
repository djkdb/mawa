import { Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';

export function Chrome({ index, total, presenting, onPrev, onNext, onToggle, titles }: { index: number; total: number; presenting: boolean; onPrev: () => void; onNext: () => void; onToggle: () => void; titles: string[] }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <>
      <header className={`fixed left-6 top-5 z-20 flex items-center gap-3 transition-opacity ${presenting ? 'opacity-0 hover:opacity-100' : ''}`}>
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        <span className="font-mono text-[11px] tracking-[0.3em] text-slate-300">MY AI WORK AGENT</span>
        <span className="hidden font-mono text-[10px] tracking-widest text-fog sm:inline">· {titles[index]}</span>
      </header>

      <nav aria-label="Slides" className="fixed bottom-5 right-6 z-20 flex items-center gap-3">
        <div className={`hidden items-center gap-1.5 font-mono text-[10px] text-fog sm:flex ${presenting ? 'opacity-0' : ''}`}>
          <span className="kbd">←</span><span className="kbd">→</span><span className="kbd">space</span> navigate · <span className="kbd">P</span> present · <span className="kbd">esc</span> exit
        </div>
        <button type="button" onClick={onPrev} aria-label="Previous slide" disabled={index === 0} className="glass rounded-md p-1.5 text-slate-300 hover:text-white disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <span className="glass rounded-md px-3 py-1.5 font-mono text-xs tabular-nums text-white" aria-live="polite">{pad(index + 1)} / {pad(total)}</span>
        <button type="button" onClick={onNext} aria-label="Next slide" disabled={index === total - 1} className="glass rounded-md p-1.5 text-slate-300 hover:text-white disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" onClick={onToggle} aria-label={presenting ? 'Exit presentation mode' : 'Enter presentation mode'} className="glass rounded-md p-1.5 text-slate-300 hover:text-white">
          {presenting ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </nav>

      <div className="fixed bottom-0 left-0 z-20 h-0.5 w-full bg-line/40" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </>
  );
}
