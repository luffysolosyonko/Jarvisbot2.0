import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useMe, useUpdateSettings } from '@/hooks/queries';
import { deviceTimeZone } from '@/lib/format';


const LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Notebook', end: true },
  { to: '/history', label: 'History' },
  { to: '/progress', label: 'Progress' },
  { to: '/settings', label: 'Settings' },
];

/** The top nav (same color as the page, one line under it) and the page. */
/** New accounts start in UTC; adopt the browser's time zone once (not for the demo). */
function useAdoptBrowserTimeZone() {
  const { data: me } = useMe();
  const update = useUpdateSettings();
  const browser = deviceTimeZone();
  const needed = !!me && !me.is_demo && me.settings.tz_name === 'UTC' && browser !== 'UTC';
  useEffect(() => {
    if (needed && update.isIdle) update.mutate({ tz_name: browser });
  }, [needed, browser, update]);
}

export function Layout() {
  useAdoptBrowserTimeZone();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Ctrl/Cmd+K anywhere: go to the Notebook with its input focused.
  useEffect(() => {
    if (pathname === '/') return; // the Notebook handles it itself
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/', { state: { focusInput: true } });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname, navigate]);
  return (
    <div className="shell">
      <a href="#main" className="visually-hidden">
        Skip to content
      </a>
      <header className="topnav">
        <div className="topnav-inner">
          <span className="brand">Jarvis</span>
          <nav aria-label="Main">
            <ul className="navlinks">
              {LINKS.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
