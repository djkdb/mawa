import { useEffect, useState } from 'react';

export type Route = 'home' | 'report' | 'runs' | 'connections' | 'settings';
const ROUTES: Route[] = ['home', 'report', 'runs', 'connections', 'settings'];

export interface Location { route: Route; param: string | null; query: URLSearchParams }

function parse(): Location {
  const [path = '', qs = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const [head, ...rest] = path.split('/');
  const route = (ROUTES as string[]).includes(head ?? '') ? (head as Route) : 'home';
  return { route, param: rest.length ? decodeURIComponent(rest.join('/')) : null, query: new URLSearchParams(qs) };
}

export function hrefFor(route: Route, param?: string | null, query?: Record<string, string>): string {
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
  return route === 'home' ? `#/${qs}` : `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}${qs}`;
}

/** The current hash's query (e.g. ?cat=팀플), read once by components that start from it. */
export function hashQuery(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '');
}

/** Tiny hash router (#/report/<runId>) so the demo works on any static host without rewrites. */
export function useHashRoute() {
  const [loc, setLoc] = useState<Location>(() => parse());
  useEffect(() => {
    const on = () => setLoc(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = (route: Route, param?: string | null) => {
    const href = hrefFor(route, param);
    if (window.location.hash === href) setLoc(parse());
    else window.location.hash = href.slice(1);
    window.scrollTo({ top: 0 });
  };
  return { ...loc, navigate };
}
