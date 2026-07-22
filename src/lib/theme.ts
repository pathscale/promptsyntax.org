import { createEffect, createSignal } from "solid-js";

export type ThemeValue = "light" | "dark";

const getInitialTheme = (): ThemeValue => {
  if (typeof window === "undefined") return "dark";

  const saved = localStorage.getItem("theme") as ThemeValue | null;
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
};

const [theme, setTheme] = createSignal<ThemeValue>("dark");

if (typeof window !== "undefined") {
  const initialTheme = getInitialTheme();
  setTheme(initialTheme);
  document.documentElement.setAttribute("data-theme", initialTheme);
}

createEffect(() => {
  const current = theme();
  if (typeof window !== "undefined") {
    document.documentElement.setAttribute("data-theme", current);
    localStorage.setItem("theme", current);
  }
});

export { setTheme, theme };
