import { useEffect, useState } from 'react';

export type Route = 'home' | 'report' | 'runs' | 'connections' | 'settings';
const ROUTES: Route[] = ['home', 'report', 'runs', 'connections', 'settings'];

export interface Location { route: Route; param: string | null }

function parse(): Location {
  const [head, ...rest] = window.location.hash.replace(/^#\/?/, '').split('/');
  const route = (ROUTES as string[]).includes(head ?? '') ? (head as Route) : 'home';
  return { route, param: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

export function hrefFor(route: Route, param?: string | null): string {
  return route === 'home' ? '#/' : `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`;
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
