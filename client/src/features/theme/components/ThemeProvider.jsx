import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectThemeMode } from '../slices/themeSlice';

export default function ThemeProvider({ children }) {
  const mode = useSelector(selectThemeMode);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    localStorage.setItem('theme', mode);
  }, [mode]);

  return <>{children}</>;
}
