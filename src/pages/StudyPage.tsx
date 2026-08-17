import { Button } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";
import VignetteTask, { type TaskResult } from "~/components/VignetteTask";

const STUDY_VERSION = "micro-3";

type Step = "consent" | "background" | "instructions" | "task" | "done";

type UsageAnswer = "Most days" | "Most weeks" | "Less often" | "Never";
type NotationAnswer = "Yes" | "No" | "Not sure";

const USAGE_OPTIONS: UsageAnswer[] = ["Most days", "Most weeks", "Less often", "Never"];
const NOTATION_OPTIONS: NotationAnswer[] = ["Yes", "No", "Not sure"];

/** The task result plus the study-only fields, encoded into the completion code. */
type StudyPayload = TaskResult & {
  q1_usage: UsageAnswer;
  q2_heard_of_notation: NotationAnswer;
  consent: true;
  study_version: typeof STUDY_VERSION;
};

function completionCode(payload: StudyPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function StudyPage(): JSX.Element {
  const [step, setStep] = createSignal<Step>("consent");
  const [consented, setConsented] = createSignal(false);
  const [usage, setUsage] = createSignal<UsageAnswer | null>(null);
  const [notation, setNotation] = createSignal<NotationAnswer | null>(null);
  const [payload, setPayload] = createSignal<StudyPayload | null>(null);
  const [copied, setCopied] = createSignal(false);

  const complete = (result: TaskResult): void => {
    const answered = usage();
    const heard = notation();
    if (!answered || !heard) return;
    setPayload({
      ...result,
      q1_usage: answered,
      q2_heard_of_notation: heard,
      consent: true,
      study_version: STUDY_VERSION,
    });
    setStep("done");
  };

  const copyCode = async (): Promise<void> => {
    const current = payload();
    if (!current) return;
    await navigator.clipboard.writeText(completionCode(current));
    setCopied(true);
  };

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
                <li>One hands-on editing task in your browser, about 5 minutes, no time limit.</li>
                <li>
                  Recorded: your two answers, task outcome, attempts, time, and the final text you
                  write.
                </li>
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
                onClick={() => setStep("instructions")}
              >
                Continue
              </Button>
            </div>
          </div>
        </Show>

        <Show when={step() === "instructions"}>
          <div class="vignette-card">
            <section aria-labelledby="instructions-title">
              <h2 id="instructions-title">The hands-on task</h2>
              <ul class="study-bullets">
                <li>Please read carefully.</li>
                <li>Change the request so it does exactly what is asked.</li>
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
                Start the task
              </Button>
            </div>
          </div>
        </Show>

        <Show when={step() === "task"}>
          <VignetteTask onComplete={complete} hideHeader />
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
