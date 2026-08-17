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

/**
 * Where the finished code goes.
 *
 * The Forms REST API cannot create responses and needs an OAuth credential, so
 * it is no use to a static page. The form's own response endpoint takes an
 * ordinary cross origin POST with no auth, which is what a browser submitting
 * the real form does.
 */
const FORM_ENDPOINT =
  "https://docs.google.com/forms/d/e/1FAIpQLSfsq_AW9-un1Vtzs2KwShlF_mG6iwsa9H-e95oQ83suJDptpg/formResponse";
const FORM_CODE_FIELD = "entry.1893891965";

type SubmitState = "idle" | "sending" | "sent" | "failed";

/**
 * Post the code to the form.
 *
 * The site's own policy decides which of these can run, which is why there are
 * two. A `connect-src` allowance for the form host makes the `fetch` work; a
 * policy that permits framing and form posts instead would suit a hidden form,
 * and one that permits neither blocks the send entirely, whatever the code
 * does. `fetch` is the narrower requirement of the two, so it is the one worth
 * having a policy for.
 *
 * Google sends no CORS headers here, so the request goes out in `no-cors` mode
 * and the reply is opaque: resolving means the request left the browser, not
 * that Google recorded it. The code stays reachable on the last screen because
 * of that gap.
 */
async function submitCode(code: string): Promise<void> {
  const body = new FormData();
  body.append(FORM_CODE_FIELD, code);
  try {
    await fetch(FORM_ENDPOINT, { method: "POST", mode: "no-cors", body });
  } catch (error) {
    // `sendBeacon` is a different path through the network stack and is not
    // governed by `connect-src`, so it sometimes lands when `fetch` is refused.
    // It reports only whether the send was queued.
    if (navigator.sendBeacon?.(FORM_ENDPOINT, body)) return;
    throw error;
  }
}

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
  const [submitState, setSubmitState] = createSignal<SubmitState>("idle");
  const [copied, setCopied] = createSignal(false);

  // The two screenshot answers are stored by position, then read back by
  // variant, so a flipped order never mislabels which condition was answered.
  const plainAnswer = (): ModelAnswer | null => (firstIsPlain ? firstAnswer() : secondAnswer());
  const receiptAnswer = (): ModelAnswer | null => (firstIsPlain ? secondAnswer() : firstAnswer());

  const consentReady = (): boolean => consented() && usage() !== null && heard() !== null;

  /**
   * Build the record, send it, and move on either way.
   *
   * The participant reaches the last screen whether or not the send worked:
   * their part is finished, and the screen itself reports what happened.
   */
  const submit = async (): Promise<void> => {
    if (submitState() === "sending") return;
    const plain = plainAnswer();
    const receipt = receiptAnswer();
    const usageAnswer = usage();
    const heardAnswer = heard();
    const preferenceAnswer = preference();
    const wouldWriteAnswer = wouldWrite();
    if (!plain || !receipt || !usageAnswer || !heardAnswer) return;
    if (!preferenceAnswer || !wouldWriteAnswer) return;

    const record: StudyPayload = {
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
    };
    setPayload(record);
    setSubmitState("sending");
    try {
      await submitCode(completionCode(record));
      setSubmitState("sent");
    } catch {
      // Offline, blocked, or the request never left. The code is still on the
      // last screen, so the participant can send it by hand instead.
      setSubmitState("failed");
    }
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
              <li>Look at two example screens from an AI app.</li>
              <li>Answer a few quick questions.</li>
              <li>Recorded: your selected choices only.</li>
              <li>No name, no email, nothing typed.</li>
              <li>Voluntary.</li>
              <li>Close the tab any time.</li>
              <li>Your answers are sent when you press Submit at the end.</li>
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
              state={
                preference() === null || wouldWrite() === null || submitState() === "sending"
                  ? "disabled"
                  : "default"
              }
              onClick={() => void submit()}
            >
              Submit
            </Button>
          </div>
        </Show>

        <Show when={page() === "done" ? payload() : null} keyed>
          {(current) => (
            <div class="study-card" aria-live="polite">
              <Show
                when={submitState() === "sent"}
                fallback={
                  <>
                    <h1 class="study-title">Almost there.</h1>
                    <ul class="study-bullets">
                      <li>Your answers could not be sent automatically.</li>
                      <li>Copy the code below and send it back where you were invited.</li>
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
                  </>
                }
              >
                <h1 class="study-title">Done. Thank you.</h1>
                <ul class="study-bullets">
                  <li>Your answers have been submitted.</li>
                  <li>Nothing else is needed. You can close this tab.</li>
                </ul>

                {/*
                  The send is opaque by design, so a failure can look like a
                  success. The code stays available, quietly, for the one
                  participant who is asked for it.
                */}
                <details class="study-fallback">
                  <summary>Asked for a code?</summary>
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
                </details>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

export default StudyPage;
