// Theme toggle button for switching between light and dark themes
import { Sun, Moon } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "../../store/slices/themeSlice";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const dispatch = useDispatch();
  const mode = useSelector((state) => state.theme.mode);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => dispatch(toggleTheme())}
      aria-label="Toggle theme"
      className="size-9"
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
