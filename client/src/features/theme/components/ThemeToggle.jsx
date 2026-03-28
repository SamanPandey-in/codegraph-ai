import { Sun, Moon } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleTheme, selectThemeMode } from '../slices/themeSlice';
import { Button } from '@/components/ui/button';

export default function ThemeToggle() {
  const dispatch = useDispatch();
  const mode = useSelector(selectThemeMode);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => dispatch(toggleTheme())}
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      className="size-9"
    >
      {mode === 'dark' ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}
