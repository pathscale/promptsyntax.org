import { Button, Icon } from "@pathscale/ui";
import type { Component } from "solid-js";
import { setTheme, theme } from "~/lib/theme";

export const ThemeToggle: Component = () => {
  const toggleTheme = () => {
    setTheme(theme() === "light" ? "dark" : "light");
  };

  const label = () => (theme() === "light" ? "Switch to dark mode" : "Switch to light mode");

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      isIconOnly
      onClick={toggleTheme}
      aria-label={label()}
      title={label()}
    >
      {theme() === "light" ? (
        <Icon name="icon-[lucide--moon]" width={16} height={16} />
      ) : (
        <Icon name="icon-[lucide--sun]" width={16} height={16} />
      )}
    </Button>
  );
};

export default ThemeToggle;
