import { Button } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";
import PromptComposer, { type ComposerModel } from "~/components/PromptComposer";
import { receiptState } from "~/lib/receipt";
import { compileVignette } from "~/lib/vignette";

export const INITIAL_PROMPT = "Summarize the attached Q3 report. Keep it concise.";

/**
 * How the two goals were satisfied. Either route is a pass, and which one a
 * participant reached for is the interesting part of the result.
 */
export type SolvedVia = "settings" | "prompt" | "both" | "unsolved";

/** Result of one run of the task, independent of the surrounding flow. */
export type TaskResult = {
  passed: boolean;
  attempts: number;
  ms_elapsed: number;
  solved_via: SolvedVia;
  final_text: string;
  canonical_form: string;
  errors_seen_count: number;
  /** The composer's state at completion. Both decide a goal. */
  dropdown_final: ComposerModel;
  force_model_final: boolean;
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
 * Two goals, one receipt row each, and two routes to each: set it in the
 * composer, or write it into the request. The check agrees with the receipt by
 * construction, since both read the same state.
 */
function VignetteTask(props: VignetteTaskProps): JSX.Element {
  const startedAt = performance.now();
  const [text, setText] = createSignal(INITIAL_PROMPT);
  const [attempts, setAttempts] = createSignal(0);
  const [done, setDone] = createSignal(false);
  const [checked, setChecked] = createSignal(false);
  const [solvedAt, setSolvedAt] = createSignal<number | null>(null);
  const [model, setModel] = createSignal<ComposerModel>("default");
  const [forceModel, setForceModel] = createSignal(false);
  const [concise, setConcise] = createSignal(true);
  const errorsSeen = new Set<string>();

  const compiled = createMemo(() => {
    const value = compileVignette(text());
    for (const error of value.errors) errorsSeen.add(error);
    return value;
  });

  const receipt = createMemo(() => receiptState(compiled(), model(), forceModel()));
  const rows = () => receipt().rows;
  const solved = () => solvedAt() !== null;

  // The prompt alone passes when the compiler says so; the settings alone pass
  // when both widgets are set. Recording which route was taken is the point of
  // the field: a pass by settings and a pass by syntax are different results.
  const solvedVia = (): SolvedVia => {
    if (!solved()) return "unsolved";
    const byPrompt = compiled().passed;
    const bySettings = model() === "atlas-4" && forceModel();
    if (byPrompt && bySettings) return "both";
    return byPrompt ? "prompt" : "settings";
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
      solved_via: solvedVia(),
      final_text: text(),
      canonical_form: compiled().canonicalForm,
      errors_seen_count: errorsSeen.size,
      dropdown_final: model(),
      force_model_final: forceModel(),
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
      if (receipt().passed) setSolvedAt(performance.now());
    });
  };

  const editText = (next: string): void => {
    setText(next);
    setChecked(false);
    setSolvedAt(null);
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
        <ul class="vignette-behavior study-bullets">
          <li>You have important work and the service is busy.</li>
          <li>The default model is selected below.</li>
          <li>Without asking, the service may silently switch to a smaller model.</li>
        </ul>

        <ul class="vignette-goal study-bullets">
          <li>Your goal: change the prompt so Atlas-4 answers.</li>
          <li>If Atlas-4 cannot answer, the request must fail instead of switching.</li>
        </ul>

        <section aria-labelledby="editor-title">
          <div class="vignette-section-heading">
            <h2 id="editor-title">Your request</h2>
          </div>

          <PromptComposer
            value={text()}
            onValueChange={editText}
            model={model()}
            onModelChange={setModel}
            forceModel={forceModel()}
            onForceModelChange={setForceModel}
            concise={concise()}
            onConciseChange={setConcise}
          />
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
                  checked() && !receipt().passed && row.tone !== "ok" ? "is-flagged" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span>{row.label}</span>
                <span>{row.detail}</span>
                <b>
                  <span aria-hidden="true">{row.glyph}</span> {row.verdict}
                </b>
                <Show when={checked() && !receipt().passed && row.tone !== "ok"}>
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
