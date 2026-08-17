import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { STUDY_PROMPT } from "~/lib/studyCompile";

/**
 * The Part A screenshot, built in-page.
 *
 * Both panels render exactly this: one composer card and one finished answer.
 * The conventional panel stops there and says nothing about what ran, which is
 * the condition being tested. The receipt panel adds a card underneath. Nothing
 * here is interactive.
 */

const RESPONSE_LINES = [
  "Q3 revenue rose 12% quarter over quarter, led by renewals in the enterprise tier.",
  "Support costs fell slightly; headcount and infrastructure spend were flat.",
];

type StudyChatMockProps = {
  /** The receipt card appears only on the receipt panel. */
  withReceipt: boolean;
};

function StudyChatMock(props: StudyChatMockProps): JSX.Element {
  return (
    <div class="study-mock">
      <div class="study-mock-composer">
        <p class="study-mock-prompt">{STUDY_PROMPT}</p>
        <div class="study-mock-toolbar">
          <span class="study-mock-select" aria-hidden="true">
            Atlas-4 <span class="study-mock-caret">▾</span>
          </span>
        </div>
      </div>

      <div class="study-mock-response">
        <p>{RESPONSE_LINES[0]}</p>
        <p>{RESPONSE_LINES[1]}</p>
      </div>

      <Show when={props.withReceipt}>
        <div class="study-mock-receipt">
          <p>Model: requested Atlas-4, ran Atlas Mini. Reason: capacity.</p>
          <p>If unavailable: switched. No restriction was set.</p>
        </div>
      </Show>
    </div>
  );
}

export default StudyChatMock;
