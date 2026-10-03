import { Briefcase, GraduationCap, ShieldCheck } from 'lucide-react';
import { PERSONAS, type PersonaId } from '../lib/persona.js';

const ICON = { student: GraduationCap, worker: Briefcase, admin: ShieldCheck } as const;

/** Whose day the demo shows: the same service for a student, a worker, and the admin who sets the policy. */
export function PersonaSwitcher({ value, onChange, compact = false }: { value: PersonaId; onChange: (id: PersonaId) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="누구의 하루로 볼까요" className={`flex gap-1 rounded-xl bg-surface-2 p-1 ${compact ? 'w-full' : ''}`}>
      {(Object.keys(PERSONAS) as PersonaId[]).map((id) => {
        const p = PERSONAS[id];
        const Icon = ICON[id];
        const on = id === value;
        return (
          <button key={id} type="button" role="radio" aria-checked={on} onClick={() => onChange(id)} title={p.role} className={`flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 ${compact ? 'text-[13px]' : 'text-sm'} ${on ? 'bg-surface font-semibold text-text shadow-sm' : 'text-text-2 hover:text-text'}`}>
            <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-accent' : ''} ${compact ? 'max-lg:inline lg:hidden' : ''}`} aria-hidden /><span className="truncate">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
