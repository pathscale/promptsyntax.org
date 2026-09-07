import { createEffect, createSignal } from "solid-js";

export type ThemeValue = "light" | "dark";

/*
 * Storage, when there is any.
 *
 * `typeof window !== "undefined"` was the guard here, and it is not the same
 * question: a renderer can have a window and no storage API at all, in which
 * case the guard passes and the next line throws. That is not hypothetical --
 * it is what happens under the QA host, where the `ReferenceError` escaped
 * module evaluation and took the whole application down before a single
 * component rendered. A person in a private window with site data blocked gets
 * the same blank page.
 *
 * `typeof localStorage` is itself inside the `try`, because reading it is what
 * throws when a browser blocks storage by policy rather than by absence.
 */
const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const getInitialTheme = (): ThemeValue => {
  if (typeof window === "undefined") return "dark";

  const saved = storage()?.getItem("theme") as ThemeValue | null;
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

// Solid 2 splits `createEffect` in two: the first function tracks and returns a
// value, the second receives it and does the side effect.
createEffect(
  () => theme(),
  (current) => {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-theme", current);
    // The theme still applies for the session when it cannot be remembered.
    // Losing the preference is a smaller failure than losing the page.
    try {
      storage()?.setItem("theme", current);
    } catch {
      /* storage full, or blocked after the read succeeded */
    }
  },
);

export { setTheme, theme };
