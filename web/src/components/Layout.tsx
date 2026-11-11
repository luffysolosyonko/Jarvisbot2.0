import { useEffect } from 'react';
import { CalendarDays, ChartLine, MessageCircle, NotebookPen, Settings, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useMe, useUpdateSettings } from '@/hooks/queries';
import { deviceTimeZone } from '@/lib/format';

const LINKS: { to: string; label: string; Icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Notebook', Icon: NotebookPen, end: true },
  { to: '/ask', label: 'Ask', Icon: MessageCircle },
  { to: '/history', label: 'History', Icon: CalendarDays },
  { to: '/progress', label: 'Progress', Icon: ChartLine },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** New accounts start in UTC; adopt the browser's time zone once. */
function useAdoptBrowserTimeZone() {
  const { data: me } = useMe();
  const update = useUpdateSettings();
  const browser = deviceTimeZone();
  const needed = !!me && me.settings.tz_name === 'UTC' && browser !== 'UTC';
  useEffect(() => {
    if (needed && update.isIdle) update.mutate({ tz_name: browser });
  }, [needed, browser, update]);
}

/** The app column (480px, centered on wide screens) with the nav along the bottom. */
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
      <nav className="bottomnav" aria-label="Main">
        <ul>
          {LINKS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                aria-label={label}
                title={label}
                className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
                <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
