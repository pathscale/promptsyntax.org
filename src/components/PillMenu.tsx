import { Dropdown } from "@pathscale/ui";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

export type PillOption<T extends string> = {
  value: T;
  label: string;
  /** Secondary line in the menu — what the option actually does. */
  hint?: string;
};

export type PillMenuProps<T extends string> = {
  /** Bold prefix that never changes, e.g. the vendor name next to the model. */
  prefix?: string;
  value: T;
  options: PillOption<T>[];
  onChange: (value: T) => void;
  /** `filled` sits on a card; `outline` is the composer's secondary pill. */
  variant?: "filled" | "outline";
  /** Decorative glyph before the label, as the model pill carries. */
  icon?: string;
  label: string;
};

/**
 * The rounded selector a real assistant uses wherever a value is swapped.
 *
 * Built on `Dropdown` rather than a native select: the trigger shows a two-tone
 * label and the menu carries a hint line per option, neither of which a select
 * can render.
 */
export function PillMenu<T extends string>(props: PillMenuProps<T>): JSX.Element {
  const current = () => props.options.find((option) => option.value === props.value);

  return (
    <Dropdown placement="top">
      <Dropdown.Trigger aria-label={props.label} class="composer-pill">
        <Show when={props.icon}>
          {(glyph) => (
            <span aria-hidden="true" class="composer-spark">
              {glyph()}
            </span>
          )}
        </Show>
        <Show when={props.prefix}>
          <span class="composer-pill-prefix">{props.prefix}</span>
        </Show>
        <span class="composer-pill-value">{current()?.label ?? props.value}</span>
        <span aria-hidden="true" class="composer-pill-caret">
          ▾
        </span>
      </Dropdown.Trigger>

      <Dropdown.Menu align="start" class="composer-pill-menu">
        <For each={props.options}>
          {(option) => (
            <Dropdown.Item
              onClick={() => props.onChange(option.value)}
              class={
                option.value === props.value
                  ? "composer-pill-item is-current"
                  : "composer-pill-item"
              }
            >
              <span class="composer-pill-item-label">{option.label}</span>
              <Show when={option.hint}>
                <span class="composer-pill-item-hint">{option.hint}</span>
              </Show>
            </Dropdown.Item>
          )}
        </For>
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default PillMenu;
