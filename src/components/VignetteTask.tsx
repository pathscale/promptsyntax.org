import { Button } from "@pathscale/ui";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { compileVignette, MINI_MODEL, PRECISE_MODEL, VIGNETTE_PARSER } from "~/lib/vignette";

export const INITIAL_PROMPT = "Summarize the attached Q3 report. Keep it concise.";

export type InputMethod = "chips" | "typed" | "mixed";

/** Result of one run of the task, independent of the surrounding flow. */
export type TaskResult = {
  passed: boolean;
  attempts: number;
  ms_elapsed: number;
  input_method: InputMethod;
  final_text: string;
  canonical_form: string;
  errors_seen_count: number;
};

type VignetteTaskProps = {
  /** Called once, when the participant either solves the task or stops early. */
  onComplete: (result: TaskResult) => void;
  /** Hide the task's own heading block when a surrounding flow supplies one. */
  hideHeader?: boolean;
};

/**
 * The hands-on authoring task: scenario, editor, chips, dry-run receipt and
 * check button. Scoring is delegated entirely to compileVignette.
 */
function VignetteTask(props: VignetteTaskProps): JSX.Element {
  const startedAt = performance.now();
  const [text, setText] = createSignal(INITIAL_PROMPT);
  const [attempts, setAttempts] = createSignal(0);
  const [typed, setTyped] = createSignal(false);
  const [usedChip, setUsedChip] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [checked, setChecked] = createSignal(false);
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
    if (done()) return;
    setDone(true);
    props.onComplete({
      passed,
      attempts: attempts(),
      ms_elapsed: Math.round(performance.now() - startedAt),
      input_method: inputMethod(),
      final_text: text(),
      canonical_form: compiled().canonicalForm,
      errors_seen_count: errorsSeen.size,
    });
  };

  const check = (): void => {
    setAttempts((count) => count + 1);
    queueMicrotask(() => {
      setChecked(true);
      if (compiled().passed) emit(true);
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
    setChecked(false);
    queueMicrotask(() => {
      const cursor = start + inserted.length;
      editor.focus();
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const syncScroll = (): void => {
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  };

  return (
    <>
      <Show when={!props.hideHeader}>
        <header class="vignette-header">
          <p class="vignette-kicker">Interactive authoring task</p>
          <h1 id="vignette-title">Keep the model choice exact</h1>
          <p>No time limit. Read carefully and revise the prompt when you are ready.</p>
        </header>
      </Show>

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
            Change the prompt so that exactly the precise model (Atlas-4) answers, and if it cannot,
            the request fails instead of switching to another model.
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
                setChecked(false);
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
          <Show when={attempts() >= 3 && !compiled().passed}>
            <button type="button" class="vignette-give-up" onClick={() => emit(false)}>
              I want to stop here
            </button>
          </Show>
          <Show when={checked() && !compiled().passed}>
            <p class="vignette-not-yet" role="status">
              Not yet. Review the receipt and try again.
            </p>
          </Show>
        </div>
      </div>
    </>
  );
}

export default VignetteTask;
