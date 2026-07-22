import { type Component, createSignal, For, onMount } from "solid-js";

type TocItem = { id: string; text: string; level: number };

type DocPageProps = {
  html: string;
  pdfHref: string;
  pdfLabel: string;
};

const DocPage: Component<DocPageProps> = (props) => {
  let contentRef: HTMLDivElement | undefined;
  const [toc, setToc] = createSignal<TocItem[]>([]);

  onMount(() => {
    if (!contentRef) return;
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
  });

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
      <article
        ref={contentRef}
        class="doc-prose max-w-[780px]"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, repo-authored spec content
        innerHTML={props.html}
      />
    </div>
  );
};

export default DocPage;
