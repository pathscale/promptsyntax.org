import { Button } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";
import PromptComposer, { type ComposerModel } from "~/components/PromptComposer";
import { receiptRows } from "~/lib/receipt";
import { compileVignette } from "~/lib/vignette";

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
  dropdown_final: ComposerModel;
};

type VignetteTaskProps = {
  /** Called once, when the participant either solves the task or stops early. */
  onComplete: (result: TaskResult) => void;
  /** Hide the task's own heading block when a surrounding flow supplies one. */
  hideHeader?: boolean;
};

/**
 * The hands-on task: scenario, composer, receipt and check button.
 *
 * Scoring is delegated entirely to `compileVignette`, which reads the prompt
 * text and nothing else. The composer's model pill and toggles are ordinary
 * controls that do not reach it.
 */
function VignetteTask(props: VignetteTaskProps): JSX.Element {
  const startedAt = performance.now();
  const [text, setText] = createSignal(INITIAL_PROMPT);
  const [attempts, setAttempts] = createSignal(0);
  const [typed, setTyped] = createSignal(false);
  const [usedChip, setUsedChip] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [checked, setChecked] = createSignal(false);
  const [solvedAt, setSolvedAt] = createSignal<number | null>(null);
  const [model, setModel] = createSignal<ComposerModel>("atlas-4");
  const [forceModel, setForceModel] = createSignal(false);
  const [concise, setConcise] = createSignal(true);
  const errorsSeen = new Set<string>();
  let editor!: HTMLTextAreaElement;

  const compiled = createMemo(() => {
    const value = compileVignette(text());
    for (const error of value.errors) errorsSeen.add(error);
    return value;
  });

  const rows = createMemo(() => receiptRows(compiled(), model()));
  const solved = () => solvedAt() !== null;

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
      // Measured to the passing check, so the time reflects solving the task
      // rather than how long the completion screen sat on someone's monitor.
      ms_elapsed: Math.round((solvedAt() ?? performance.now()) - startedAt),
      input_method: inputMethod(),
      final_text: text(),
      canonical_form: compiled().canonicalForm,
      errors_seen_count: errorsSeen.size,
      dropdown_final: model(),
    });
  };

  const check = (): void => {
    if (solved()) {
      emit(true);
      return;
    }
    setAttempts((count) => count + 1);
    queueMicrotask(() => {
      setChecked(true);
      if (compiled().passed) setSolvedAt(performance.now());
    });
  };

  const editText = (next: string): void => {
    setText(next);
    setChecked(false);
    setSolvedAt(null);
  };

  const insertAtCursor = (syntax: string): void => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = text().slice(0, start);
    const after = text().slice(end);
    const leading = before.length > 0 && !/\s$/u.test(before) ? " " : "";
    const trailing = after.length > 0 && !/^\s/u.test(after) ? " " : "";
    const inserted = `${leading}${syntax}${trailing}`;
    editText(`${before}${inserted}${after}`);
    setUsedChip(true);
    queueMicrotask(() => {
      const cursor = start + inserted.length;
      editor.focus();
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const validation = (): { tone: "neutral" | "error"; text: string } => {
    // A prompt that pins nothing is not malformed, it is just unfinished, and
    // the compiler says so through the same channel as a real syntax error.
    // The receipt is where that case is answered, so this line stays neutral.
    if (compiled().steps.length === 0) {
      const real = compiled().errors.filter((error) => !error.startsWith("No model is fixed"));
      if (real.length > 0) return { tone: "error", text: real.join(" ") };
      return { tone: "neutral", text: "No routing instructions recognized yet." };
    }
    if (compiled().errors.length > 0) {
      return { tone: "error", text: compiled().errors.join(" ") };
    }
    return { tone: "neutral", text: "Recognized. Check the receipt." };
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
        <p class="vignette-behavior">
          You have important work and the service is busy. The model is already selected below, but
          without asking you the service may silently switch to a smaller model that could degrade
          the work.
        </p>

        <p class="vignette-goal">
          Your goal: change the prompt so the precise model (Atlas-4) answers. If Atlas-4 cannot
          answer, the request must fail instead of switching.
        </p>

        <section aria-labelledby="editor-title">
          <div class="vignette-section-heading">
            <h2 id="editor-title">Your request</h2>
          </div>

          <PromptComposer
            value={text()}
            onValueChange={(next) => {
              editText(next);
              setTyped(true);
            }}
            model={model()}
            onModelChange={setModel}
            forceModel={forceModel()}
            onForceModelChange={setForceModel}
            concise={concise()}
            onConciseChange={setConcise}
            editorRef={(element) => {
              editor = element;
            }}
          />

          <div class={`vignette-validation is-${validation().tone}`} aria-live="polite">
            {validation().text}
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
          <p class="vignette-chips-caption">
            Shortcuts insert the syntax for you. Typing works too.
          </p>
        </section>

        <section class="vignette-receipt" aria-labelledby="receipt-title">
          <div class="vignette-section-heading">
            <h2 id="receipt-title">What would happen</h2>
          </div>
          <For each={rows()}>
            {(row) => (
              <div
                class={[
                  "vignette-receipt-row",
                  `is-${row.tone}`,
                  checked() && !compiled().passed && row.tone !== "ok" ? "is-flagged" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span>{row.label}</span>
                <span>{row.detail}</span>
                <b>
                  <span aria-hidden="true">{row.glyph}</span> {row.verdict}
                </b>
                <Show when={checked() && !compiled().passed && row.tone !== "ok"}>
                  <span class="sr-only">This row does not match the goal.</span>
                </Show>
              </div>
            )}
          </For>
        </section>

        <div class="vignette-actions">
          <Button type="button" variant="solid" flavor="primary" onClick={check}>
            {solved() ? "Continue" : "Check my answer"}
          </Button>

          <Show when={attempts() > 0}>
            <span class="vignette-attempts">Attempts: {attempts()}</span>
          </Show>

          <Show when={attempts() >= 3 && !solved()}>
            <button type="button" class="vignette-give-up" onClick={() => emit(false)}>
              I want to stop here
            </button>
          </Show>
        </div>

        <Show when={checked() && !solved()}>
          <p class="vignette-banner is-warn" role="status">
            Not yet. Compare each receipt row with the goal: at least one row does not match.
          </p>
        </Show>
        <Show when={solved()}>
          <p class="vignette-banner is-ok" role="status">
            That does it. The receipt now matches the goal exactly.
          </p>
        </Show>
      </div>
    </>
  );
}

export default VignetteTask;
