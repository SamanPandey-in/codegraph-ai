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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon"
        className="size-9 lg:hidden"
        onClick={onSidebarToggle}
        aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {isSidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      <Link
        to="/dashboard"
        className="flex items-center gap-1.5 font-bold text-sm lg:hidden"
      >
        <Code2 className="size-4 text-primary" />
        <span>CodeGraph<span className="text-primary">AI</span></span>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <ThemeToggle />

        {user && (
          <div className="flex items-center gap-2 ml-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="size-5 rounded-full"
                />
              ) : (
                <User className="size-4 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-foreground">
                {user.username || user.email}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-muted-foreground hover:text-foreground"
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
