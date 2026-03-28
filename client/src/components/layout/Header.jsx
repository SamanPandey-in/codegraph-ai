import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, Code2, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context/AuthContext';
import { ThemeToggle } from '@/features/theme';

export default function Header({ isSidebarOpen, onSidebarToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/60 px-4 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon"
        className="size-9 lg:hidden text-muted-foreground hover:text-foreground"
        onClick={onSidebarToggle}
        aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {isSidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      <Link
        to="/dashboard"
        className="flex items-center gap-1.5 font-bold text-sm lg:hidden"
      >
        <Code2 className="size-4 text-gold" />
        <span className="text-foreground">CodeGraph<span className="text-gold">AI</span></span>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <ThemeToggle />

        {user && (
          <div className="flex items-center gap-2 ml-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 shadow-sm">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="size-5 rounded-full ring-1 ring-border"
                />
              ) : (
                <div className="flex size-5 items-center justify-center rounded-full bg-muted">
                  <User className="size-3 text-muted-foreground" />
                </div>
              )}
              <span className="text-xs font-semibold text-foreground/90">
                {user.username || user.email}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
