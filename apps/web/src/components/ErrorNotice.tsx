import { CircleAlert } from 'lucide-react';
import { friendlyError } from '../lib/friendly-error.js';

/** A failure in plain Korean — what happened and what to do — with the original message folded away. */
export function ErrorNotice({ message, className = '' }: { message: string; className?: string }) {
  const f = friendlyError(message);
  return (
    <div role="alert" className={`rounded-lg bg-danger/10 px-4 py-3 text-sm ${className}`}>
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger">{f.title}</p>
          <p className="mt-0.5 text-text-2">{f.fix}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {f.action && <a href={f.action.href} className="font-medium text-accent hover:underline">{f.action.label} →</a>}
            <details className="text-xs text-text-3"><summary className="cursor-pointer">원문 보기</summary><code className="mt-1 block whitespace-pre-wrap break-all font-mono">{message}</code></details>
          </div>
        </div>
      </div>
    </div>
  );
}
