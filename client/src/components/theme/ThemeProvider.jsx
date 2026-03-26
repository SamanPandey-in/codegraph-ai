// Theme provider component that applies the selected theme to the application
import { useEffect } from "react";
import { useSelector } from "react-redux";

export default function ThemeProvider({ children }) {
  const mode = useSelector((state) => state.theme.mode);

  // Sync theme with document and localStorage
  useEffect(() => {
    const root = document.documentElement;

    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    localStorage.setItem("theme", mode);
  }, [mode]);

  return <>{children}</>;
}
