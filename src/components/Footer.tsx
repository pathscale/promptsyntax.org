import { Footer as LibFooter, Link } from "@pathscale/ui";
import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import { CONTACT_EMAIL, GITHUB_URL, ROUTES } from "~/config/routes";

export const Footer: Component = () => (
  <LibFooter class="border-base-300 border-t px-6 py-8">
    <div class="page-container flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div class="text-base-content/60">
        Prompt Syntax · a vendor-neutral specification proposal · Draft v0.2.1 · CC BY 4.0
        (proposed)
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <A class="text-base-content/55 text-xs hover:text-base-content" href={ROUTES.SPEC}>
          Spec
        </A>
        <A class="text-base-content/55 text-xs hover:text-base-content" href={ROUTES.SYNTAX}>
          Syntax reference
        </A>
        <Link
          class="text-base-content/55 text-xs"
          href={GITHUB_URL}
          rel="noopener noreferrer"
          target="_blank"
          underline="hover"
        >
          GitHub
        </Link>
        <Link
          class="text-base-content/55 text-xs"
          href={`mailto:${CONTACT_EMAIL}`}
          underline="hover"
        >
          Contact
        </Link>
      </div>
    </div>
  </LibFooter>
);

export default Footer;
