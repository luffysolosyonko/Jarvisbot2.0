import { CalendarDays, ChartLine, NotebookPen, Settings, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useMe, useUpdateSettings } from '@/hooks/queries';
import { deviceTimeZone } from '@/lib/format';

import { NAV_ICON } from './icons';

const LINKS: { to: string; label: string; Icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Notebook', Icon: NotebookPen, end: true },
  { to: '/history', label: 'History', Icon: CalendarDays },
  { to: '/progress', label: 'Progress', Icon: ChartLine },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** The page, with the tab bar along the bottom. */
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
      <Outlet />
      {/* The tab bar sits along the bottom: icon over label, current tab in the accent. */}
      <nav className="tabbar" aria-label="Main">
        <ul>
          {LINKS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
                <Icon {...NAV_ICON} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
