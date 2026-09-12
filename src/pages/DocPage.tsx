import { type Component, createEffect, createSignal, For } from "solid-js";

type TocItem = { id: string; text: string; level: number };

type DocPageProps = {
  documentId: string;
  html: string;
  pdfHref: string;
  pdfLabel: string;
};

const DocPage: Component<DocPageProps> = (props) => {
  let contentRef: HTMLDivElement | undefined;
  const [toc, setToc] = createSignal<TocItem[]>([]);

  // Runs once the content div is attached. Solid 2 replaces `onMount` with the
  // two-argument `createEffect`: the first function tracks, the second acts.
  createEffect(
    () => props.html,
    () => {
      if (!contentRef) return;
      const hrefCounts = new Map<string, number>();
      for (const anchor of contentRef.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href") ?? "link";
        // Pandoc emits empty, aria-hidden self-links for source-code line
        // anchors. They are position markers rather than controls. Leaving an
        // href on them exposes dozens of anonymous links to the semantic tree.
        if (
          anchor.getAttribute("aria-hidden") === "true" &&
          anchor.getAttribute("tabindex") === "-1" &&
          !anchor.textContent?.trim() &&
          href.startsWith("#")
        ) {
          anchor.removeAttribute("href");
          continue;
        }
        const key = href.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "link";
        const occurrence = (hrefCounts.get(key) ?? 0) + 1;
        hrefCounts.set(key, occurrence);
        anchor.id = `doc-${props.documentId}-link-${key}-${occurrence}`;
        if (href.startsWith("#")) anchor.setAttribute("data-slot", "document-content-link");
      }
      const items: TocItem[] = [];
      for (const heading of contentRef.querySelectorAll("h2[id], h3[id]")) {
        items.push({
          id: heading.id,
          text: heading.textContent?.replace(/\s+/g, " ").trim() ?? "",
          level: heading.tagName === "H2" ? 2 : 3,
        });
      }
      setToc(items);

      if (window.location.hash) {
        const id = window.location.hash.slice(1);
        scrollToHeading(id, "instant");
        // Re-anchor once the full document has laid out (large tables shift heights).
        setTimeout(() => scrollToHeading(id, "instant"), 300);
      }
    },
  );

  // Leave `behavior` to CSS (html { scroll-behavior: smooth }) unless overridden.
  const scrollToHeading = (id: string, behavior?: ScrollBehavior) => {
    const target = document.getElementById(id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo(behavior ? { top, behavior } : { top });
  };

  const scrollTo = (event: MouseEvent, id: string) => {
    event.preventDefault();
    scrollToHeading(id);
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div class="page-container grid gap-9 py-8 pb-20 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside class="hidden lg:block">
        <nav class="doc-toc sticky top-20 max-h-[calc(100vh-6rem)] overflow-auto border-base-300 border-r pr-4">
          <a
            id={`doc-${props.documentId}-pdf`}
            href={props.pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            class="mb-3 block font-medium text-primary"
          >
            {props.pdfLabel} ↓
          </a>
          <For each={toc()}>
            {(item) => (
              <a
                id={`doc-${props.documentId}-toc-${item.id}`}
                data-slot="document-toc-link"
                href={`#${item.id}`}
                class={item.level === 3 ? "toc-h3" : undefined}
                onClick={(event) => scrollTo(event, item.id)}
              >
                {item.text}
              </a>
            )}
          </For>
        </nav>
      </aside>
      <article ref={contentRef} class="doc-prose max-w-[780px]" innerHTML={props.html} />
    </div>
  );
};

export default DocPage;
