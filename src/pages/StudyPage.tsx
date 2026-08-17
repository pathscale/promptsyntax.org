import { Button } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onCleanup, Show } from "solid-js";
import StudyChatMock from "~/components/StudyChatMock";
import StudyControlTask, { type ControlResult } from "~/components/StudyControlTask";
import type { StudyModel } from "~/lib/studyCompile";

const STUDY_VERSION = "micro-4";

type Step =
  | "consent"
  | "background"
  | "panel_first"
  | "panel_second"
  | "instructions"
  | "task"
  | "questions"
  | "done";

type UsageAnswer = "Most days" | "Most weeks" | "Less often" | "Never";
type NotationAnswer = "Yes" | "No" | "Not sure";
type PanelAnswer = "Atlas-4" | "Atlas Mini" | "Cannot tell from what is shown";
type BusyAnswer = "It switches to Atlas Mini" | "The request fails and tells me" | "I cannot tell";
type AllowsAnswer = "Yes" | "No" | "Cannot tell";
type PanelOrder = "conventional_first" | "receipt_first";

const USAGE_OPTIONS: UsageAnswer[] = ["Most days", "Most weeks", "Less often", "Never"];
const NOTATION_OPTIONS: NotationAnswer[] = ["Yes", "No", "Not sure"];
const PANEL_OPTIONS: PanelAnswer[] = ["Atlas-4", "Atlas Mini", "Cannot tell from what is shown"];
const BUSY_OPTIONS: BusyAnswer[] = [
  "It switches to Atlas Mini",
  "The request fails and tells me",
  "I cannot tell",
];
const ALLOWS_OPTIONS: AllowsAnswer[] = ["Yes", "No", "Cannot tell"];

/** The flat record encoded into the completion code. */
type StudyPayload = {
  consent: true;
  q1_usage: UsageAnswer;
  q2_heard_of_notation: NotationAnswer;
  a_order: PanelOrder;
  a_conventional_answer: PanelAnswer;
  a_receipt_answer: PanelAnswer;
  b_achieved: boolean;
  b_attempts: number;
  b_ms_elapsed: number;
  dropdown_final: StudyModel;
  force_toggle_final: boolean;
  b_q1_answer: BusyAnswer;
  b_q2_answer: AllowsAnswer;
  canonical_form: string;
  ms_elapsed_total: number;
  study_version: typeof STUDY_VERSION;
};

function completionCode(payload: StudyPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** One coin flip per participant, decided on load and recorded with the answers. */
function coinFlip(): PanelOrder {
  return Math.random() < 0.5 ? "conventional_first" : "receipt_first";
}

function StudyPage(): JSX.Element {
  const startedAt = performance.now();

  // The site-wide tab title names the project, which participants would read in
  // the browser tab. Neutral while the study is open, restored on the way out
  // so no other page is affected.
  const siteTitle = document.title;
  document.title = "Research study";
  onCleanup(() => {
    document.title = siteTitle;
  });

  const [step, setStep] = createSignal<Step>("consent");
  const [consented, setConsented] = createSignal(false);
  const [usage, setUsage] = createSignal<UsageAnswer | null>(null);
  const [notation, setNotation] = createSignal<NotationAnswer | null>(null);

  const order = coinFlip();
  const [firstAnswer, setFirstAnswer] = createSignal<PanelAnswer | null>(null);
  const [secondAnswer, setSecondAnswer] = createSignal<PanelAnswer | null>(null);

  const [control, setControl] = createSignal<ControlResult | null>(null);
  const [busy, setBusy] = createSignal<BusyAnswer | null>(null);
  const [allows, setAllows] = createSignal<AllowsAnswer | null>(null);

  const [payload, setPayload] = createSignal<StudyPayload | null>(null);
  const [copied, setCopied] = createSignal(false);

  /** Which condition each panel screen shows, given this participant's flip. */
  const firstIsReceipt = order === "receipt_first";

  const conventionalAnswer = (): PanelAnswer | null =>
    firstIsReceipt ? secondAnswer() : firstAnswer();
  const receiptAnswer = (): PanelAnswer | null => (firstIsReceipt ? firstAnswer() : secondAnswer());

  const finish = (): void => {
    const answered = usage();
    const heard = notation();
    const conventional = conventionalAnswer();
    const receipt = receiptAnswer();
    const result = control();
    const busyAnswer = busy();
    const allowsAnswer = allows();
    if (!answered || !heard || !conventional || !receipt || !result) return;
    if (!busyAnswer || !allowsAnswer) return;
    setPayload({
      consent: true,
      q1_usage: answered,
      q2_heard_of_notation: heard,
      a_order: order,
      a_conventional_answer: conventional,
      a_receipt_answer: receipt,
      b_achieved: result.b_achieved,
      b_attempts: result.b_attempts,
      b_ms_elapsed: result.b_ms_elapsed,
      dropdown_final: result.dropdown_final,
      force_toggle_final: result.force_toggle_final,
      b_q1_answer: busyAnswer,
      b_q2_answer: allowsAnswer,
      canonical_form: result.canonical_form,
      ms_elapsed_total: Math.round(performance.now() - startedAt),
      study_version: STUDY_VERSION,
    });
    setStep("done");
  };

  /**
   * Copy the code, and say so even when the clipboard refuses.
   *
   * `navigator.clipboard` is unavailable without a secure context and can
   * reject on a permission prompt. Confirming first means a rejection still
   * leaves the button labelled and the field selected for a manual copy.
   */
  const copyCode = async (): Promise<void> => {
    const current = payload();
    if (!current) return;
    const code = completionCode(current);
    setCopied(true);
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      const field = document.querySelector<HTMLInputElement>("#study-completion-code");
      field?.select();
    }
  };

  const panelScreen = (
    withReceipt: boolean,
    answer: () => PanelAnswer | null,
    setAnswer: (value: PanelAnswer) => void,
    onContinue: () => void,
    name: string,
  ): JSX.Element => (
    <div class="vignette-card">
      <StudyChatMock withReceipt={withReceipt} />

      <fieldset class="study-question">
        <legend>Which model wrote this answer?</legend>
        <For each={PANEL_OPTIONS}>
          {(option) => (
            <label class="study-option">
              <input
                type="radio"
                name={name}
                value={option}
                checked={answer() === option}
                onChange={() => setAnswer(option)}
              />
              <span>{option}</span>
            </label>
          )}
        </For>
      </fieldset>

      <div class="vignette-actions">
        <Button
          type="button"
          variant="solid"
          flavor="primary"
          state={answer() === null ? "disabled" : "default"}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );

  return (
    <div class="vignette-page">
      <section class="vignette-shell" aria-labelledby="study-title">
        <header class="vignette-header">
          <h1 id="study-title">Research study</h1>
        </header>

        <Show when={step() === "consent"}>
          <div class="vignette-card">
            <section aria-labelledby="consent-title">
              <h2 id="consent-title">5 Minute Research Survey</h2>
              <ul class="study-bullets">
                <li>Two short questions about screenshots, one hands-on goal, about 5 minutes.</li>
                <li>Recorded: your answers, settings you choose, and time taken. No free text.</li>
                <li>No name, email, or account. Nothing is sent anywhere by this page.</li>
                <li>
                  You get a completion code at the end; only what you send back reaches the study.
                </li>
                <li>Voluntary. Close the tab any time and nothing is recorded.</li>
                <li>You will be told what the study is about after you finish.</li>
              </ul>
              <label class="study-consent">
                <input
                  type="checkbox"
                  checked={consented()}
                  onChange={(event) => setConsented(event.currentTarget.checked)}
                />
                <span>I agree to take part.</span>
              </label>
            </section>
            <div class="vignette-actions">
              <Button
                type="button"
                variant="solid"
                flavor="primary"
                state={consented() ? "default" : "disabled"}
                onClick={() => setStep("background")}
              >
                Begin
              </Button>
            </div>
          </div>
        </Show>

        <Show when={step() === "background"}>
          <div class="vignette-card">
            <fieldset class="study-question">
              <legend>How often do you use AI?</legend>
              <For each={USAGE_OPTIONS}>
                {(option) => (
                  <label class="study-option">
                    <input
                      type="radio"
                      name="q1_usage"
                      value={option}
                      checked={usage() === option}
                      onChange={() => setUsage(option)}
                    />
                    <span>{option}</span>
                  </label>
                )}
              </For>
            </fieldset>

            <fieldset class="study-question">
              <legend>
                Before today, had you used or read about a structured prompt notation?
              </legend>
              <For each={NOTATION_OPTIONS}>
                {(option) => (
                  <label class="study-option">
                    <input
                      type="radio"
                      name="q2_heard_of_notation"
                      value={option}
                      checked={notation() === option}
                      onChange={() => setNotation(option)}
                    />
                    <span>{option}</span>
                  </label>
                )}
              </For>
            </fieldset>

            <div class="vignette-actions">
              <Button
                type="button"
                variant="solid"
                flavor="primary"
                state={usage() === null || notation() === null ? "disabled" : "default"}
                onClick={() => setStep("panel_first")}
              >
                Continue
              </Button>
            </div>
          </div>
        </Show>

        <Show when={step() === "panel_first"}>
          {panelScreen(
            firstIsReceipt,
            firstAnswer,
            setFirstAnswer,
            () => setStep("panel_second"),
            "a_panel_first",
          )}
        </Show>

        <Show when={step() === "panel_second"}>
          {panelScreen(
            !firstIsReceipt,
            secondAnswer,
            setSecondAnswer,
            () => setStep("instructions"),
            "a_panel_second",
          )}
        </Show>

        <Show when={step() === "instructions"}>
          <div class="vignette-card">
            <section aria-labelledby="instructions-title">
              <h2 id="instructions-title">The hands-on goal</h2>
              <ul class="study-bullets">
                <li>Please read carefully.</li>
                <li>Use the controls to meet the goal. You cannot edit the text.</li>
                <li>No time limit.</li>
              </ul>
            </section>
            <div class="vignette-actions">
              <Button
                type="button"
                variant="solid"
                flavor="primary"
                onClick={() => setStep("task")}
              >
                Start
              </Button>
            </div>
          </div>
        </Show>

        <Show when={step() === "task"}>
          <StudyControlTask
            onComplete={(result) => {
              setControl(result);
              setStep("questions");
            }}
          />
        </Show>

        <Show when={step() === "questions" ? control() : null} keyed>
          {(result) => (
            <div class="vignette-card">
              <fieldset class="study-question">
                <legend>According to the receipt, what happens if Atlas-4 is busy?</legend>
                <For each={BUSY_OPTIONS}>
                  {(option) => (
                    <label class="study-option">
                      <input
                        type="radio"
                        name="b_q1_answer"
                        value={option}
                        checked={busy() === option}
                        onChange={() => setBusy(option)}
                      />
                      <span>{option}</span>
                    </label>
                  )}
                </For>
              </fieldset>

              {/*
                Stopping early leaves no passing record, so the card says that
                plainly rather than showing an empty box. B-Q2 is still asked,
                since "cannot tell" is a real answer about nothing.
              */}
              <section class="study-record" aria-labelledby="study-record-title">
                <h2 id="study-record-title">The machine record your settings produced</h2>
                <Show
                  when={result.canonical_form}
                  fallback={<p class="study-record-empty">No record was produced.</p>}
                >
                  <pre class="study-record-body">{result.canonical_form}</pre>
                </Show>
              </section>

              <fieldset class="study-question">
                <legend>Does this record allow switching to another model?</legend>
                <For each={ALLOWS_OPTIONS}>
                  {(option) => (
                    <label class="study-option">
                      <input
                        type="radio"
                        name="b_q2_answer"
                        value={option}
                        checked={allows() === option}
                        onChange={() => setAllows(option)}
                      />
                      <span>{option}</span>
                    </label>
                  )}
                </For>
              </fieldset>

              <div class="vignette-actions">
                <Button
                  type="button"
                  variant="solid"
                  flavor="primary"
                  state={busy() === null || allows() === null ? "disabled" : "default"}
                  onClick={finish}
                >
                  Finish
                </Button>
              </div>
            </div>
          )}
        </Show>

        <Show when={step() === "done" ? payload() : null} keyed>
          {(current) => (
            <div class="vignette-card">
              <section class="vignette-complete" aria-live="polite">
                <h2>Task complete</h2>
                <ul class="study-bullets">
                  <li>Copy the completion code below.</li>
                  <li>Send it back in the same chat where you were invited.</li>
                  <li>That is the last step. Thank you.</li>
                </ul>
                <label for="study-completion-code">Completion code</label>
                <div>
                  <input
                    id="study-completion-code"
                    readonly
                    value={completionCode(current)}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button type="button" onClick={() => void copyCode()}>
                    {copied() ? "Copied" : "Copy"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </Show>
      </section>
    </div>
  );
}

export default StudyPage;
