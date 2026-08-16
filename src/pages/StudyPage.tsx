import { Button } from "@pathscale/ui";
import { createSignal, For, type JSX, Show } from "solid-js";
import VignetteTask, { type TaskResult } from "~/components/VignetteTask";

const STUDY_VERSION = "micro-1";

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
              <h2 id="consent-title">A 5 minute research task</h2>
              <p>
                This is a short study run by an independent researcher about how people write
                requests to AI services. You will answer two background questions, then do one
                hands-on editing task in your browser. It takes about 5 minutes and there is no time
                limit.
              </p>
              <p>
                What is recorded: your two answers, whether the task was solved, the number of
                attempts, the time taken, and the final text you wrote. No name, email, or account
                is collected, and nothing is sent anywhere by this page: at the end you get a
                completion code, and the study only receives what you choose to send back.
              </p>
              <p>
                Taking part is voluntary. You can close this tab at any point and nothing is
                recorded. After you finish, you will be told what the study is about.
              </p>
              <label class="study-consent">
                <input
                  type="checkbox"
                  checked={consented()}
                  onChange={(event) => setConsented(event.currentTarget.checked)}
                />
                <span>I have read the above and agree to take part.</span>
              </label>
            </section>
            <div class="vignette-actions">
              <Button
                type="button"
                variant="primary"
                isDisabled={!consented()}
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
              <legend>How often do you use AI chat or coding assistants?</legend>
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
                variant="primary"
                isDisabled={usage() === null || notation() === null}
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
              <p>
                On the next screen you will see a request someone typed to an AI service, and a live
                preview showing what the service would actually do with it. Your job is to change
                the request so it does exactly what is asked. There is no time limit. Read each
                screen carefully.
              </p>
              <ul class="study-legend">
                <li>Highlighted text in the editor is a control the service recognizes.</li>
                <li>The validation line reports whether the request currently compiles.</li>
                <li>The preview rows show what would run, in words as well as status labels.</li>
              </ul>
            </section>
            <div class="vignette-actions">
              <Button type="button" variant="primary" onClick={() => setStep("task")}>
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
                <p>
                  Copy this completion code and send it back in the same chat where you were
                  invited. That is the last step. Thank you.
                </p>
                <label for="study-completion-code">Completion code</label>
                <div>
                  <input
                    id="study-completion-code"
                    readOnly
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
