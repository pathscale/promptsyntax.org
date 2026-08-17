import { Button } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  compileStudy,
  meetsGoal,
  STUDY_PROMPT,
  type StudyModel,
  studyRows,
} from "~/lib/studyCompile";

/** What one run of the hands-on task produced. */
export type ControlResult = {
  b_achieved: boolean;
  b_attempts: number;
  b_ms_elapsed: number;
  dropdown_final: StudyModel;
  force_toggle_final: boolean;
  canonical_form: string;
};

type StudyControlTaskProps = {
  /** Called once, when the participant passes the check or gives up. */
  onComplete: (result: ControlResult) => void;
};

const MODEL_OPTIONS: StudyModel[] = ["atlas-4", "atlas-mini"];
const MODEL_LABELS: Record<StudyModel, string> = {
  "atlas-4": "Atlas-4",
  "atlas-mini": "Atlas Mini",
};

/**
 * The hands-on goal, with no authoring anywhere.
 *
 * The prompt is read-only. A dropdown and a toggle are the only inputs, and
 * they compile through the vignette compiler to a canonical record; the receipt
 * rows and the check button both read that compiled value, so the receipt
 * cannot claim something the record does not say.
 */
function StudyControlTask(props: StudyControlTaskProps): JSX.Element {
  const startedAt = performance.now();
  const [model, setModel] = createSignal<StudyModel>("atlas-4");
  const [mustUse, setMustUse] = createSignal(false);
  const [attempts, setAttempts] = createSignal(0);
  const [checked, setChecked] = createSignal(false);
  const [solvedAt, setSolvedAt] = createSignal<number | null>(null);
  const [done, setDone] = createSignal(false);

  const compiled = createMemo(() => compileStudy(model(), mustUse()));
  const passes = () => meetsGoal(compiled());
  const rows = () => studyRows(compiled(), model());
  const solved = () => solvedAt() !== null;

  const emit = (achieved: boolean): void => {
    if (done()) return;
    setDone(true);
    const record = compiled();
    // A pass is only ever reported alongside the record that earned it. Giving
    // up reports no record at all, so a non-empty canonical form in the payload
    // always means a form that passed.
    const passing = achieved && meetsGoal(record);
    props.onComplete({
      b_achieved: passing,
      b_attempts: attempts(),
      b_ms_elapsed: Math.round((solvedAt() ?? performance.now()) - startedAt),
      dropdown_final: model(),
      force_toggle_final: mustUse(),
      canonical_form: passing ? record.canonicalForm : "",
    });
  };

  const check = (): void => {
    if (solved()) return;
    setAttempts((count) => count + 1);
    setChecked(true);
    if (passes()) setSolvedAt(performance.now());
  };

  // Any change to the controls retracts a previous verdict, so the banner never
  // describes a state the participant has since moved away from.
  const changeModel = (next: StudyModel): void => {
    setModel(next);
    setChecked(false);
    setSolvedAt(null);
  };

  const changeMustUse = (next: boolean): void => {
    setMustUse(next);
    setChecked(false);
    setSolvedAt(null);
  };

  return (
    <div class="vignette-card">
      <p class="study-scenario">
        You have important work and the service is busy. The model is already selected below, but
        without asking you the service may silently switch to a smaller model that could degrade the
        work.
      </p>

      <p class="study-goal">
        Your goal: make sure exactly Atlas-4 answers. If Atlas-4 cannot answer, the request must
        fail instead of switching.
      </p>

      <section aria-labelledby="study-request-title">
        <div class="vignette-section-heading">
          <h2 id="study-request-title">Your request</h2>
        </div>

        <div class="study-composer">
          <p class="study-composer-prompt">{STUDY_PROMPT}</p>

          <div class="study-composer-toolbar">
            <label class="study-composer-model">
              <span>Model</span>
              <select
                value={model()}
                onChange={(event) => changeModel(event.currentTarget.value as StudyModel)}
              >
                <For each={MODEL_OPTIONS}>
                  {(option) => <option value={option}>{MODEL_LABELS[option]}</option>}
                </For>
              </select>
            </label>

            <button
              type="button"
              class={mustUse() ? "study-composer-toggle is-on" : "study-composer-toggle"}
              aria-pressed={mustUse() ? "true" : "false"}
              onClick={() => changeMustUse(!mustUse())}
            >
              Must use selected model
            </button>

            <button
              type="button"
              class="study-composer-send"
              disabled
              aria-label="Sending is disabled in this study"
            >
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </div>
      </section>

      <section class="vignette-receipt" aria-labelledby="study-receipt-title">
        <div class="vignette-section-heading">
          <h2 id="study-receipt-title">What would happen</h2>
        </div>
        <For each={rows()}>
          {(row) => (
            <div class={`vignette-receipt-row is-${row.tone}`}>
              <span>{row.label}</span>
              <span>{row.detail}</span>
              <b>
                <span aria-hidden="true">{row.glyph}</span> {row.verdict}
              </b>
            </div>
          )}
        </For>
      </section>

      <div class="vignette-actions">
        <Show when={!solved()}>
          <Button type="button" variant="solid" flavor="primary" onClick={check}>
            Check my answer
          </Button>
        </Show>

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
          Not yet. Compare each receipt row with the goal.
        </p>
      </Show>

      <Show when={solved()}>
        <p class="vignette-banner is-ok" role="status">
          That does it. The receipt now matches the goal exactly.
        </p>
        <div class="vignette-actions">
          <Button type="button" variant="solid" flavor="primary" onClick={() => emit(true)}>
            Continue
          </Button>
        </div>
      </Show>
    </div>
  );
}

export default StudyControlTask;
