import { CalendarDays, ChartLine, NotebookPen, Settings, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

import { NAV_ICON } from './icons';

const LINKS: { to: string; label: string; Icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Notebook', Icon: NotebookPen, end: true },
  { to: '/history', label: 'History', Icon: CalendarDays },
  { to: '/progress', label: 'Progress', Icon: ChartLine },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** Top navigation and a centred 640px column. */
export function Layout() {
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
              {LINKS.map(({ to, label, Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
                    <Icon {...NAV_ICON} aria-hidden="true" />
                    <span className="navlabel">{label}</span>
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
