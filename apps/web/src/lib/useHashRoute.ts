import { useEffect, useState } from 'react';

export type Route = 'home' | 'report' | 'runs' | 'connections' | 'settings';
const ROUTES: Route[] = ['home', 'report', 'runs', 'connections', 'settings'];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'home';
}

/** Tiny hash router so the demo works on any static host without rewrites. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse());
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = (r: Route) => { window.location.hash = r === 'home' ? '/' : `/${r}`; window.scrollTo({ top: 0 }); };
  return { route, navigate };
}
