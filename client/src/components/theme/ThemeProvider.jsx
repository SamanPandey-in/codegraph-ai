// theme provider component that applies the selected theme to the application
import { useMemo, useEffect } from "react";
import { useSelector } from "react-redux";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { getMuiTheme } from "../../styles/muiTheme";

export default function ThemeProvider({ children }) {
  const mode = useSelector((state) => state.theme.mode);

  // Generate MUI theme based on Redux mode
  const muiTheme = useMemo(() => getMuiTheme(mode), [mode]);

  // Sync Tailwind dark mode automatically
  useEffect(() => {
    const root = document.documentElement;

    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    localStorage.setItem("theme", mode);
  }, [mode]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {/* 
        Optional wrapper: make all icons/text inherit the current color automatically.
        This ensures that Lucide icons with `currentColor` always match the text color.
      */}
      <div className="text-text dark:text-white">{children}</div>
    </MuiThemeProvider>
  );
}
