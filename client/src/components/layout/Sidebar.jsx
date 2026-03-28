import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Code2,
  LayoutDashboard,
  Network,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    to: '/dashboard',
    icon: <LayoutDashboard className="size-4 shrink-0" />,
    label: 'Dashboard',
  },
  {
    to: '/analyze',
    icon: <Network className="size-4 shrink-0" />,
    label: 'Analyze',
  },
];

export default function Sidebar({
  isOpen,
  isCollapsed,
  onClose,
  onToggleCollapse,
}) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background',
          'transition-all duration-300 ease-in-out',
          isCollapsed ? 'lg:w-16' : 'lg:w-60',
          isOpen ? 'translate-x-0 w-60' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4 shrink-0">
          <Link
            to="/dashboard"
            onClick={onClose}
            className="flex items-center gap-2 min-w-0"
          >
            <Code2 className="size-5 text-primary shrink-0" />
            {!isCollapsed && (
              <span className="font-bold text-sm truncate">
                CodeGraph<span className="text-primary">AI</span>
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      isCollapsed && 'justify-center px-2',
                    )
                  }
                  title={isCollapsed ? label : undefined}
                >
                  {icon}
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden lg:flex border-t border-border p-2 justify-end">
          <button
            onClick={onToggleCollapse}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
