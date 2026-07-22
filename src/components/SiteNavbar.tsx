import { Navbar } from "@pathscale/ui";
import { A, useLocation } from "@solidjs/router";
import clsx from "clsx";
import type { Component } from "solid-js";
import Logo from "~/components/Logo";
import { GITHUB_URL, ROUTES } from "~/config/routes";
import ThemeToggle from "~/ThemeToggle";

const SiteNavbar: Component = () => {
  const location = useLocation();

  const isActive = (path: string) =>
    path === ROUTES.HOME ? location.pathname === path : location.pathname.startsWith(path);

  const navLinkClass = (path: string) =>
    clsx("rounded px-3 py-1.5 font-medium text-sm transition-colors", {
      "bg-base-200 text-base-content": isActive(path),
      "text-base-content/70 hover:bg-base-200/60 hover:text-base-content": !isActive(path),
    });

  return (
    <Navbar.Stack sticky class="top-0 z-20">
      <Navbar.Row bordered class="site-nav" padded={false}>
        <div class="page-container flex min-h-14 items-center justify-between gap-4">
          <Navbar.Start>
            <A href={ROUTES.HOME} class="mr-4 no-underline">
              <Logo class="text-base" />
            </A>
            <nav class="hidden items-center gap-1 sm:flex">
              <A href={ROUTES.SPEC} class={navLinkClass(ROUTES.SPEC)}>
                Specification
              </A>
              <A href={ROUTES.SYNTAX} class={navLinkClass(ROUTES.SYNTAX)}>
                Syntax reference
              </A>
            </nav>
          </Navbar.Start>
          <Navbar.End>
            <div class="flex items-center gap-1">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                class="rounded px-3 py-1.5 font-medium text-base-content/70 text-sm transition-colors hover:bg-base-200/60 hover:text-base-content"
              >
                GitHub
              </a>
              <ThemeToggle />
            </div>
          </Navbar.End>
        </div>
      </Navbar.Row>
    </Navbar.Stack>
  );
};

export default SiteNavbar;
