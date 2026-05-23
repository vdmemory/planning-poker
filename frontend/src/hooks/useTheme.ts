import { useState, useEffect } from "react";

export type Theme = "dark" | "light" | "system";

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove("light");
  if (theme === "light") {
    html.classList.add("light");
  } else if (theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches) {
    html.classList.add("light");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("pp:theme") as Theme) || "dark"
  );

  function setTheme(t: Theme) {
    localStorage.setItem("pp:theme", t);
    applyTheme(t);
    setThemeState(t);
  }

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(theme);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
