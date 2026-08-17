import { Button } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onCleanup, Show } from "solid-js";

const STUDY_VERSION = "micro-5";

/** Four pages, one question each. `done` reveals the code. */
type Page = "consent" | "shot_first" | "shot_second" | "closing" | "done";

type UsageAnswer = "Most days" | "Most weeks" | "Less often" | "Never";
type HeardAnswer = "Yes" | "No" | "Not sure";
type ModelAnswer = "Atlas-4" | "Atlas Mini" | "I can't tell";
type PreferenceAnswer = "Yes" | "No" | "Don't care";
type WouldWriteAnswer = "Yes" | "No" | "I don't know";
type Order = "plain_first" | "receipt_first";

const USAGE_OPTIONS: UsageAnswer[] = ["Most days", "Most weeks", "Less often", "Never"];
const HEARD_OPTIONS: HeardAnswer[] = ["Yes", "No", "Not sure"];
const MODEL_OPTIONS: ModelAnswer[] = ["Atlas-4", "Atlas Mini", "I can't tell"];
const PREFERENCE_OPTIONS: PreferenceAnswer[] = ["Yes", "No", "Don't care"];
const WOULD_WRITE_OPTIONS: WouldWriteAnswer[] = ["Yes", "No", "I don't know"];

const USER_MESSAGE = "Summarize the attached Q3 report. Keep it concise.";
const ASSISTANT_LINES = [
  "Q3 revenue rose 12% quarter over quarter, led by renewals in the enterprise tier.",
  "Support costs fell slightly, while headcount and infrastructure spend stayed flat.",
];

/** Exactly the fields the completion code carries. */
type StudyPayload = {
  consent: true;
  q1_usage: UsageAnswer;
  q2_heard_of_notation: HeardAnswer;
  order: Order;
  answer_plain: ModelAnswer;
  answer_receipt: ModelAnswer;
  answer_preference: PreferenceAnswer;
  answer_would_write: WouldWriteAnswer;
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
function coinFlip(): Order {
  return Math.random() < 0.5 ? "plain_first" : "receipt_first";
}

/**
 * The chat mock: a picture made of DOM, nothing interactive.
 *
 * The plain variant is this and nothing else, so the participant has no way to
 * know which model answered. The receipt variant adds one card under the
 * assistant bubble, which is the entire difference being measured.
 */
function ChatMock(props: { withReceipt: boolean }): JSX.Element {
  return (
    <div class="shot">
      <div class="shot-bubble shot-bubble-user">{USER_MESSAGE}</div>

      <div class="shot-composer">
        <span class="shot-composer-text">Message Atlas</span>
        <span class="shot-composer-model">
          Atlas-4 <span aria-hidden="true">▾</span>
        </span>
      </div>

      <div class="shot-bubble shot-bubble-assistant">
        <p>{ASSISTANT_LINES[0]}</p>
        <p>{ASSISTANT_LINES[1]}</p>
      </div>

      <Show when={props.withReceipt}>
        <div class="shot-receipt">
          <p class="shot-receipt-title">Execution receipt</p>
          <p>Requested: Atlas-4</p>
          <p>Ran: Atlas Mini (capacity)</p>
        </div>
      </Show>
    </div>
  );
}

/** A question with big tap targets. One per page. */
function Choice<T extends string>(props: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T | null;
  onSelect: (value: T) => void;
}): JSX.Element {
  return (
    <fieldset class="ask">
      <legend class="ask-legend">{props.legend}</legend>
      <div class="ask-options">
        <For each={props.options}>
          {(option) => (
            <label class={props.value === option ? "ask-option is-picked" : "ask-option"}>
              <input
                type="radio"
                name={props.name}
                value={option}
                checked={props.value === option}
                onChange={() => props.onSelect(option)}
              />
              <span>{option}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}

function StudyPage(): JSX.Element {
  const startedAt = performance.now();

  // The site wide tab title names the project, which a participant would read
  // in the browser tab. Neutral while the study is open, restored on the way
  // out so no other page is affected.
  const siteTitle = document.title;
  document.title = "Research survey";
  onCleanup(() => {
    document.title = siteTitle;
  });

  const [page, setPage] = createSignal<Page>("consent");
  const [consented, setConsented] = createSignal(false);
  const [usage, setUsage] = createSignal<UsageAnswer | null>(null);
  const [heard, setHeard] = createSignal<HeardAnswer | null>(null);

  const order = coinFlip();
  const firstIsPlain = order === "plain_first";
  const [firstAnswer, setFirstAnswer] = createSignal<ModelAnswer | null>(null);
  const [secondAnswer, setSecondAnswer] = createSignal<ModelAnswer | null>(null);

  const [preference, setPreference] = createSignal<PreferenceAnswer | null>(null);
  const [wouldWrite, setWouldWrite] = createSignal<WouldWriteAnswer | null>(null);

  const [payload, setPayload] = createSignal<StudyPayload | null>(null);
  const [copied, setCopied] = createSignal(false);

  // The two screenshot answers are stored by position, then read back by
  // variant, so a flipped order never mislabels which condition was answered.
  const plainAnswer = (): ModelAnswer | null => (firstIsPlain ? firstAnswer() : secondAnswer());
  const receiptAnswer = (): ModelAnswer | null => (firstIsPlain ? secondAnswer() : firstAnswer());

  const consentReady = (): boolean => consented() && usage() !== null && heard() !== null;

  const finish = (): void => {
    const plain = plainAnswer();
    const receipt = receiptAnswer();
    const usageAnswer = usage();
    const heardAnswer = heard();
    const preferenceAnswer = preference();
    const wouldWriteAnswer = wouldWrite();
    if (!plain || !receipt || !usageAnswer || !heardAnswer) return;
    if (!preferenceAnswer || !wouldWriteAnswer) return;
    setPayload({
      consent: true,
      q1_usage: usageAnswer,
      q2_heard_of_notation: heardAnswer,
      order,
      answer_plain: plain,
      answer_receipt: receipt,
      answer_preference: preferenceAnswer,
      answer_would_write: wouldWriteAnswer,
      ms_elapsed_total: Math.round(performance.now() - startedAt),
      study_version: STUDY_VERSION,
    });
    setPage("done");
  };

  /**
   * Copy the code, and say so even when the clipboard refuses.
   *
   * `navigator.clipboard` is unavailable without a secure context and can
   * reject on a permission prompt. Confirming first means a rejection still
   * leaves the button labelled, and the field is selected for a manual copy.
   */
  const copyCode = async (): Promise<void> => {
    const current = payload();
    if (!current) return;
    const code = completionCode(current);
    setCopied(true);
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      const field = document.querySelector<HTMLInputElement>("#study-code");
      field?.select();
    }
  };

  const shotPage = (
    withReceipt: boolean,
    value: () => ModelAnswer | null,
    onSelect: (answer: ModelAnswer) => void,
    name: string,
    onNext: () => void,
  ): JSX.Element => (
    <div class="study-card">
      <ChatMock withReceipt={withReceipt} />
      <Choice
        legend="Which model wrote this answer?"
        name={name}
        options={MODEL_OPTIONS}
        value={value()}
        onSelect={onSelect}
      />
      <Button
        type="button"
        variant="solid"
        flavor="primary"
        class="study-next"
        state={value() === null ? "disabled" : "default"}
        onClick={onNext}
      >
        Next
      </Button>
    </div>
  );

  return (
    <div class="study-page">
      <div class="study-shell">
        <Show when={page() === "consent"}>
          <div class="study-card">
            <h1 class="study-title">2 Minute Research Survey</h1>
            <ul class="study-bullets">
              <li>Look at two screenshots, answer one question about each.</li>
              <li>Recorded: your taps only. No name, no email, nothing typed.</li>
              <li>Voluntary. Close the tab any time.</li>
              <li>You get a code at the end; send it back where you were invited.</li>
            </ul>

            <label class={consented() ? "study-consent is-picked" : "study-consent"}>
              <input
                type="checkbox"
                checked={consented()}
                onChange={(event) => setConsented(event.currentTarget.checked)}
              />
              <span>I agree to take part.</span>
            </label>

            <Choice
              legend="How often do you use AI?"
              name="q1_usage"
              options={USAGE_OPTIONS}
              value={usage()}
              onSelect={setUsage}
            />

            <Choice
              legend="Had you heard of structured prompt notations before today?"
              name="q2_heard"
              options={HEARD_OPTIONS}
              value={heard()}
              onSelect={setHeard}
            />

            <Button
              type="button"
              variant="solid"
              flavor="primary"
              class="study-next"
              state={consentReady() ? "default" : "disabled"}
              onClick={() => setPage("shot_first")}
            >
              Start
            </Button>
          </div>
        </Show>

        <Show when={page() === "shot_first"}>
          {shotPage(!firstIsPlain, firstAnswer, setFirstAnswer, "shot_first", () =>
            setPage("shot_second"),
          )}
        </Show>

        <Show when={page() === "shot_second"}>
          {shotPage(firstIsPlain, secondAnswer, setSecondAnswer, "shot_second", () =>
            setPage("closing"),
          )}
        </Show>

        <Show when={page() === "closing"}>
          <div class="study-card">
            <Choice
              legend="Should AI apps show you this kind of receipt?"
              name="preference"
              options={PREFERENCE_OPTIONS}
              value={preference()}
              onSelect={setPreference}
            />

            {/*
              The only notation in the whole flow, and it appears here only,
              after both screenshot answers are locked, so seeing it cannot
              colour what the participant already answered.
            */}
            <div class="study-imagine">
              <p>Imagine typing this in your message gave you exact control over the AI:</p>
              <pre class="study-snippet">&lt;ps&gt;@atlas-4 else fail&lt;/ps&gt;</pre>
            </div>

            <Choice
              legend="Would you ever write something like that yourself?"
              name="would_write"
              options={WOULD_WRITE_OPTIONS}
              value={wouldWrite()}
              onSelect={setWouldWrite}
            />

            <Button
              type="button"
              variant="solid"
              flavor="primary"
              class="study-next"
              state={preference() === null || wouldWrite() === null ? "disabled" : "default"}
              onClick={finish}
            >
              Finish
            </Button>
          </div>
        </Show>

        <Show when={page() === "done" ? payload() : null} keyed>
          {(current) => (
            <div class="study-card" aria-live="polite">
              <h1 class="study-title">Done. Thank you.</h1>
              <ul class="study-bullets">
                <li>Copy the code below.</li>
                <li>Send it back in the same chat where you were invited.</li>
              </ul>

              <div class="study-code">
                <input
                  id="study-code"
                  readonly
                  value={completionCode(current)}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" class="study-copy" onClick={() => void copyCode()}>
                  {copied() ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

export default StudyPage;
