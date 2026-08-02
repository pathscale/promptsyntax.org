import { Button } from "@pathscale/ui";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { compileVignette, MINI_MODEL, PRECISE_MODEL, VIGNETTE_PARSER } from "~/lib/vignette";

const INITIAL_PROMPT = "Summarize the attached Q3 report. Keep it concise.";

type InputMethod = "chips" | "typed" | "mixed";

type ResultPayload = {
  passed: boolean;
  attempts: number;
  ms_elapsed: number;
  input_method: InputMethod;
  final_text: string;
  canonical_form: string;
  errors_seen_count: number;
};

function completionCode(payload: ResultPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function VignettePage(): JSX.Element {
  const startedAt = performance.now();
  const [text, setText] = createSignal(INITIAL_PROMPT);
  const [attempts, setAttempts] = createSignal(0);
  const [typed, setTyped] = createSignal(false);
  const [usedChip, setUsedChip] = createSignal(false);
  const [result, setResult] = createSignal<ResultPayload | null>(null);
  const [copied, setCopied] = createSignal(false);
  const errorsSeen = new Set<string>();
  let editor!: HTMLTextAreaElement;
  let highlight!: HTMLPreElement;

  const compiled = createMemo(() => {
    const value = compileVignette(text());
    for (const error of value.errors) errorsSeen.add(error);
    return value;
  });

  const inputMethod = (): InputMethod => {
    if (typed() && usedChip()) return "mixed";
    return usedChip() ? "chips" : "typed";
  };

  const emit = (passed: boolean): void => {
    const payload: ResultPayload = {
      passed,
      attempts: attempts(),
      ms_elapsed: Math.round(performance.now() - startedAt),
      input_method: inputMethod(),
      final_text: text(),
      canonical_form: compiled().canonicalForm,
      errors_seen_count: errorsSeen.size,
    };
    setResult(payload);
    window.parent.postMessage({ type: "ps-vignette-result", payload }, "*");
  };

  const check = (): void => {
    setAttempts((count) => count + 1);
    queueMicrotask(() => {
      if (compiled().passed) emit(true);
      else setResult(null);
    });
  };

  const insertAtCursor = (syntax: string): void => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = text().slice(0, start);
    const after = text().slice(end);
    const leading = before.length > 0 && !/\s$/u.test(before) ? " " : "";
    const trailing = after.length > 0 && !/^\s/u.test(after) ? " " : "";
    const inserted = `${leading}${syntax}${trailing}`;
    setText(`${before}${inserted}${after}`);
    setUsedChip(true);
    setResult(null);
    setCopied(false);
    queueMicrotask(() => {
      const cursor = start + inserted.length;
      editor.focus();
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const copyCode = async (): Promise<void> => {
    const payload = result();
    if (!payload) return;
    await navigator.clipboard.writeText(completionCode(payload));
    setCopied(true);
  };

  const syncScroll = (): void => {
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  };

  return (
    <div class="vignette-page">
      <section class="vignette-shell" aria-labelledby="vignette-title">
        <header class="vignette-header">
          <p class="vignette-kicker">Interactive authoring task</p>
          <h1 id="vignette-title">Keep the model choice exact</h1>
          <p>No time limit. Read carefully and revise the prompt when you are ready.</p>
        </header>

        <div class="vignette-card">
          <section aria-labelledby="scenario-title">
            <h2 id="scenario-title">Scenario</h2>
            <p>
              You are asking for a summary of a work report. The service is under heavy load. Right
              now, if the model you wanted is busy, the service quietly switches to a smaller one.
            </p>
            <p class="vignette-behavior">
              Service behavior: under heavy load this service may switch to a smaller model unless
              told otherwise.
            </p>
          </section>

          <section aria-labelledby="goal-title">
            <h2 id="goal-title">Goal</h2>
            <p class="vignette-goal">
              Change the prompt so that exactly the precise model (Atlas-4) answers, and if it
              cannot, the request fails instead of switching to another model.
            </p>
          </section>

          <section aria-labelledby="editor-title">
            <div class="vignette-section-heading">
              <h2 id="editor-title">Edit the prompt</h2>
              <span>Recognized directives are highlighted</span>
            </div>
            <div class="vignette-editor-wrap">
              <pre ref={highlight} class="vignette-highlight" aria-hidden="true">
                <For each={VIGNETTE_PARSER.parse(text()).segments}>
                  {(segment) =>
                    segment.type === "directive" ? <mark>{segment.source}</mark> : segment.text
                  }
                </For>
              </pre>
              <textarea
                ref={editor}
                class="vignette-editor"
                aria-label="Prompt editor"
                spellcheck={false}
                value={text()}
                onInput={(event) => {
                  setText(event.currentTarget.value);
                  setTyped(true);
                  setResult(null);
                  setCopied(false);
                }}
                onScroll={syncScroll}
              />
            </div>
            <div class="vignette-validation" aria-live="polite">
              <Show
                when={compiled().errors.length > 0}
                fallback={<span class="text-success">Valid compiled route.</span>}
              >
                <For each={compiled().errors}>{(error) => <span>{error}</span>}</For>
              </Show>
            </div>
            <fieldset class="vignette-chips" aria-label="Insert prompt controls">
              <button type="button" onClick={() => insertAtCursor("@atlas-4!")}>
                Use the precise model
              </button>
              <button type="button" onClick={() => insertAtCursor("else fail")}>
                Fail instead of switching
              </button>
              <button type="button" onClick={() => insertAtCursor("else @atlas-mini")}>
                Add a fallback model
              </button>
            </fieldset>
          </section>

          <section class="vignette-receipt" aria-labelledby="receipt-title">
            <div class="vignette-section-heading">
              <h2 id="receipt-title">Dry-run receipt</h2>
              <span>Requested compared with what would run</span>
            </div>
            <div class="vignette-receipt-row">
              <span>Model binding</span>
              <span>
                {compiled().steps[0]?.canonical === PRECISE_MODEL
                  ? "requested Atlas-4, would run Atlas-4"
                  : compiled().steps[0]?.canonical === MINI_MODEL
                    ? "requested Atlas Mini, would run Atlas Mini"
                    : "requested default, would try Atlas-4"}
              </span>
              <b>{compiled().steps[0] ? "BOUND" : "NOT FIXED"}</b>
            </div>
            <div class="vignette-receipt-row">
              <span>Fallback route</span>
              <span>
                {compiled().passed
                  ? "would fail, no substitute permitted"
                  : compiled().steps.length > 1
                    ? "would switch to Atlas Mini"
                    : compiled().steps.length === 0
                      ? "would switch (load)"
                      : "no permitted route to the precise model"}
              </span>
              <b>{compiled().passed ? "FAIL CLOSED" : "MAY SWITCH"}</b>
            </div>
          </section>

          <div class="vignette-actions">
            <Button type="button" variant="primary" onClick={check}>
              Check my answer
            </Button>
            <Show when={attempts() >= 3 && !compiled().passed && result() === null}>
              <button type="button" class="vignette-give-up" onClick={() => emit(false)}>
                I give up
              </button>
            </Show>
            <Show when={attempts() > 0 && result() === null && !compiled().passed}>
              <p class="vignette-not-yet" role="status">
                Not yet. Review the receipt and try again.
              </p>
            </Show>
          </div>

          <Show when={result()}>
            {(payload) => (
              <section class="vignette-complete" aria-live="polite">
                <h2>{payload().passed ? "Complete" : "Task ended"}</h2>
                <p>
                  {payload().passed
                    ? "Your compiled prompt keeps the precise model and fails closed."
                    : "Your response has been recorded."}
                </p>
                <label for="completion-code">Completion code</label>
                <div>
                  <input
                    id="completion-code"
                    readOnly
                    value={completionCode(payload())}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button type="button" onClick={() => void copyCode()}>
                    {copied() ? "Copied" : "Copy"}
                  </button>
                </div>
              </section>
            )}
          </Show>
        </div>
      </section>
    </div>
  );
}

export default VignettePage;
