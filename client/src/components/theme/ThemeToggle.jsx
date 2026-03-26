// Gives the user a button to toggle between light and dark themes.
import { IconButton, Tooltip } from "@mui/material";
import { Sun, Moon } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "../../store/slices/themeSlice";

export default function ThemeToggle() {
  const dispatch = useDispatch();
  const mode = useSelector((state) => state.theme.mode);

  return (
    <Tooltip title="Toggle theme">
      <IconButton
        onClick={() => dispatch(toggleTheme())}
        className="text-black dark:text-white" // automatic icon color
      >
        {mode === "dark" ? <Sun /> : <Moon />}
      </IconButton>
    </Tooltip>
  );
}
