import { Button, Link, Navbar } from "@pathscale/ui";
import { useLocation } from "@solidjs/router";
import type { Component } from "solid-js";
import Logo from "~/components/Logo";
import { GITHUB_URL, ROUTES } from "~/config/routes";
import ThemeToggle from "~/ThemeToggle";

const SiteNavbar: Component = () => {
  const location = useLocation();

  const isActive = (path: string) =>
    path === ROUTES.HOME ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <Navbar.Stack sticky class="top-0 z-20">
      <Navbar.Row bordered class="site-nav" padded={false}>
        <div class="page-container flex min-h-14 items-center justify-between gap-4">
          <Navbar.Start>
            <Link
              id="site-home"
              href={ROUTES.HOME}
              class="mr-4 inline-flex min-h-8 items-center"
              underline="none"
            >
              <Logo class="text-base" />
            </Link>
            <nav class="hidden items-center gap-1 sm:flex">
              <Button
                href={ROUTES.SPEC}
                size="sm"
                variant={isActive(ROUTES.SPEC) ? "soft" : "ghost"}
              >
                Specification
              </Button>
              <Button
                href={ROUTES.SYNTAX}
                size="sm"
                variant={isActive(ROUTES.SYNTAX) ? "soft" : "ghost"}
              >
                Syntax reference
              </Button>
            </nav>
          </Navbar.Start>
          <Navbar.End>
            <div class="flex items-center gap-1">
              <Button
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                variant="ghost"
              >
                GitHub
              </Button>
              <ThemeToggle />
            </div>
          </Navbar.End>
        </div>
      </Navbar.Row>
    </Navbar.Stack>
  );
};

export default SiteNavbar;
