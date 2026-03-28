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
            'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-muted/50 backdrop-blur-md',
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
              <Code2 className="size-5 text-gold shrink-0" />
              {!isCollapsed && (
                <span className="font-bold text-sm tracking-tight text-foreground">
                  CodeGraph<span className="text-gold">AI</span>
                </span>
              )}
            </Link>
          </div>
  
          <nav className="flex-1 overflow-y-auto py-6 px-3">
            <ul className="flex flex-col gap-2">
              {NAV_ITEMS.map(({ to, icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group',
                        isActive
                          ? 'text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        isCollapsed && 'justify-center px-1',
                      )
                    }
                    title={isCollapsed ? label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-gold" />
                        )}
                        <span className={cn(
                          "shrink-0",
                          isActive ? "text-gold" : "text-muted-foreground group-hover:text-foreground"
                        )}>
                          {icon}
                        </span>
                        {!isCollapsed && <span className="truncate">{label}</span>}
                      </>
                    )}
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
