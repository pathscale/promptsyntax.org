import { Footer as LibFooter, Link } from "@pathscale/ui";
import type { Component } from "solid-js";
import { CONTACT_EMAIL, GITHUB_URL, ROUTES } from "~/config/routes";

export const Footer: Component = () => (
  <LibFooter class="border-base-300 border-t px-6 py-8">
    <div class="page-container flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div class="text-base-content/60">
        PromptSyntax · a vendor-neutral specification proposal · Draft v0.2.1 · CC BY 4.0 (proposed)
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          id="footer-specification"
          class="text-base-content/55 text-xs"
          href={ROUTES.SPEC}
          underline="hover"
        >
          Spec
        </Link>
        <Link
          id="footer-syntax-reference"
          class="text-base-content/55 text-xs"
          href={ROUTES.SYNTAX}
          underline="hover"
        >
          Syntax reference
        </Link>
        <Link
          id="footer-github"
          class="text-base-content/55 text-xs"
          href={GITHUB_URL}
          rel="noopener noreferrer"
          target="_blank"
          underline="hover"
        >
          GitHub
        </Link>
        <Link
          id="footer-contact"
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
