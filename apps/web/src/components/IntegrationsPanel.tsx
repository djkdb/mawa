import { Mail, CalendarDays, Link2, Unlink, GitBranch } from 'lucide-react';
import type { IntegrationStatus, Status } from '../lib/api.js';

function Row({ icon, name, status, account, connectUrl, onDisconnect }: { icon: React.ReactNode; name: string; status: IntegrationStatus; account: string | null; connectUrl: string; onDisconnect: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="text-fog">{icon}</span>
        <div>
          <div className="text-sm text-white">{name}</div>
          <div className="font-mono text-[10px] text-fog">
            {status === 'connected' ? `connected${account ? ` · ${account}` : ''}` : status === 'disconnected' ? 'not connected' : 'OAuth not configured (.env)'}
          </div>
        </div>
      </div>
      {status === 'connected' ? (
        <button type="button" onClick={onDisconnect} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-fog hover:text-white">
          <Unlink className="h-3 w-3" /> Disconnect
        </button>
      ) : status === 'disconnected' ? (
        <a href={connectUrl} className="inline-flex items-center gap-1 rounded-md border border-accent/50 bg-accent-soft px-2 py-1 font-mono text-[10px] text-white hover:brightness-110">
          <Link2 className="h-3 w-3" /> Connect {name}
        </a>
      ) : (
        <span className="rounded-md border border-line px-2 py-1 font-mono text-[10px] text-fog/70">Coming when configured</span>
      )}
    </li>
  );
}

export function IntegrationsPanel({ status, onDisconnect }: { status: Status | null; onDisconnect: (p: 'github' | 'google') => void }) {
  if (!status) return null;
  const g = status.integrations.github;
  const go = status.integrations.google;
  return (
    <section className="rounded-2xl border border-line/70 bg-panel/60 p-5">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">Integrations</h2>
      <ul className="mt-2 divide-y divide-line/60">
        <Row icon={<GitBranch className="h-4 w-4" />} name="GitHub" status={g.status} account={g.account} connectUrl={g.connectUrl} onDisconnect={() => onDisconnect('github')} />
        <Row icon={<Mail className="h-4 w-4" />} name="Gmail" status={go.status} account={go.account} connectUrl={go.connectUrl} onDisconnect={() => onDisconnect('google')} />
        <Row icon={<CalendarDays className="h-4 w-4" />} name="Google Calendar" status={go.status} account={go.account} connectUrl={go.connectUrl} onDisconnect={() => onDisconnect('google')} />
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-fog">
        Read-only scopes. Tokens are exchanged server-side and {status.tokenStore.persistent ? 'stored encrypted at rest.' : 'kept in memory only until SESSION_ENCRYPTION_KEY is set.'}
      </p>
    </section>
  );
}
