import { useEffect, useState } from 'react';
import { Activity, FileText, MessageSquare, Plug } from 'lucide-react';

const ITEMS = [
  { id: 'ask', label: '질문', icon: MessageSquare },
  { id: 'activity', label: '에이전트 활동', icon: Activity },
  { id: 'report', label: '리포트', icon: FileText },
  { id: 'connections', label: '연결된 소스', icon: Plug },
];

/** Desktop section navigation; the active item follows the scroll position. */
export function SectionRail({ available }: { available: Set<string> }) {
  const [active, setActive] = useState('ask');
  useEffect(() => {
    const els = ITEMS.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [available]);
  return (
    <nav aria-label="섹션" className="rail sticky top-20 hidden self-start lg:block">
      <div className="mb-2 px-2.5 text-xs font-medium text-text-3">워크스페이스</div>
      <ul className="space-y-0.5">
        {ITEMS.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={active === i.id ? 'true' : undefined} className={available.has(i.id) ? '' : 'opacity-40'}>
              <i.icon className="h-4 w-4" aria-hidden /> {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
