import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import PillMenu from "~/components/PillMenu";
import { VIGNETTE_PARSER } from "~/lib/vignette";

export type ComposerModel = "default" | "atlas-4" | "atlas-mini";

const MODEL_OPTIONS = [
  { value: "default" as const, label: "Default", hint: "The service decides" },
  { value: "atlas-4" as const, label: "Atlas-4", hint: "The precise model" },
  { value: "atlas-mini" as const, label: "Atlas Mini", hint: "Smaller and faster" },
];

type PromptComposerProps = {
  value: string;
  onValueChange: (next: string) => void;
  /** Set by the toolbar's model pill. Advisory: it never reaches the compiler. */
  model: ComposerModel;
  onModelChange: (model: ComposerModel) => void;
  forceModel: boolean;
  onForceModelChange: (on: boolean) => void;
  concise: boolean;
  onConciseChange: (on: boolean) => void;
};

/**
 * The prompt surface, dressed as a real assistant's composer: a field, a row of
 * controls under it, and a chip for the setting that is currently on.
 *
 * Only the text matters. The model pill, the force toggle and the concise
 * toggle are the ordinary controls someone would have already used before
 * typing, and none of them reach the compiler: that is the point of the task,
 * since picking a model in a menu is not the same as pinning it in the request.
 */
function PromptComposer(props: PromptComposerProps): JSX.Element {
  let highlight!: HTMLPreElement;
  let editor!: HTMLTextAreaElement;

  const syncScroll = (): void => {
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  };

  return (
    <div class="composer">
      <Show when={props.forceModel}>
        <div class="composer-attachments">
          <span class="composer-chip">
            <span aria-hidden="true">◆</span>
            Model choice enforced
            <button
              type="button"
              class="composer-chip-remove"
              aria-label="Remove the enforced model choice"
              onClick={() => props.onForceModelChange(false)}
            >
              ×
            </button>
          </span>
        </div>
      </Show>

      <div class="composer-field">
        <pre ref={highlight} class="composer-highlight" aria-hidden="true">
          <For each={VIGNETTE_PARSER.parse(props.value).segments}>
            {(segment) =>
              segment.type === "directive" ? <mark>{segment.source}</mark> : segment.text
            }
          </For>
        </pre>
        <textarea
          ref={(element: HTMLTextAreaElement) => {
            editor = element;
          }}
          class="composer-input"
          aria-label="Prompt"
          placeholder="Write a message…"
          spellcheck={false}
          rows={4}
          value={props.value}
          onInput={(event) => props.onValueChange(event.currentTarget.value)}
          onScroll={syncScroll}
        />
      </div>

      {/*
        Posture controls left, model controls and send right, the way the
        product this imitates arranges them. The row may wrap on a narrow
        window: the right cluster drops whole rather than splitting.
      */}
      <div class="composer-toolbar">
        <div class="composer-cluster">
          <button
            type="button"
            class={props.concise ? "composer-toggle is-on" : "composer-toggle"}
            aria-pressed={props.concise ? "true" : "false"}
            onClick={() => props.onConciseChange(!props.concise)}
          >
            <span aria-hidden="true" class="composer-spark">
              ✦
            </span>
            Concise
          </button>

          <button type="button" class="composer-icon" aria-label="Attach a file">
            <span aria-hidden="true">+</span>
          </button>

          <button type="button" class="composer-icon" aria-label="Add from a folder">
            <span aria-hidden="true">⊞</span>
          </button>
        </div>

        <div class="composer-cluster composer-cluster-end">
          <button
            type="button"
            class={props.forceModel ? "composer-toggle is-on" : "composer-toggle"}
            aria-pressed={props.forceModel ? "true" : "false"}
            onClick={() => props.onForceModelChange(!props.forceModel)}
          >
            Force this Model
          </button>

          <PillMenu
            label="Model"
            variant="outline"
            icon="✦"
            value={props.model}
            options={MODEL_OPTIONS}
            onChange={props.onModelChange}
          />

          <button type="button" class="composer-icon" aria-label="Dictate">
            <span aria-hidden="true">⌗</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PromptComposer;
