import type { ComposerModel } from "~/components/PromptComposer";
import { type Compilation, MINI_MODEL, PRECISE_MODEL } from "~/lib/vignette";

export type RowTone = "ok" | "warn" | "bad";

export type ReceiptRow = {
  label: string;
  detail: string;
  verdict: string;
  tone: RowTone;
  glyph: string;
};

const GLYPH: Record<RowTone, string> = { ok: "✓", warn: "!", bad: "✗" };

/**
 * The receipt, read off the same compilation the scorer grades.
 *
 * Deriving both rows from `compiled` is the point: if these rows agreed with
 * the goal while the scorer disagreed, the task would be unwinnable, so there
 * is deliberately no second opinion about the prompt here. `dropdown` only
 * chooses the wording of the unbound case, never a verdict.
 */
export function receiptRows(
  compiled: Compilation,
  dropdown: ComposerModel,
  forceModel = false,
): ReceiptRow[] {
  const bound = compiled.steps[0]?.canonical;

  const model: ReceiptRow =
    bound === PRECISE_MODEL
      ? {
          label: "Model",
          detail: "Atlas-4, pinned in the prompt",
          verdict: "EXACTLY AS ASKED",
          tone: "ok",
          glyph: GLYPH.ok,
        }
      : bound === MINI_MODEL
        ? {
            label: "Model",
            detail: "Atlas Mini, pinned in the prompt",
            verdict: "NOT WHAT THE GOAL ASKS",
            tone: "bad",
            glyph: GLYPH.bad,
          }
        : {
            label: "Model",
            // The toggle is a setting on this screen, not part of the request,
            // so it changes what the row can honestly claim and nothing else.
            // Saying so is the whole lesson: the switch looks like a guarantee
            // and the receipt is where you find out it was not one.
            detail: forceModel
              ? dropdown === "atlas-mini"
                ? "the setting asks for Atlas Mini, but the request does not pin it"
                : "the setting asks for Atlas-4, but the request does not pin it"
              : dropdown === "atlas-mini"
                ? "dropdown asks for Atlas Mini, service may still switch under load"
                : "dropdown asks for Atlas-4, service may still switch under load",
            verdict: forceModel ? "SETTING ONLY" : "WOULD SWITCH",
            tone: "warn",
            glyph: GLYPH.warn,
          };

  const fallback: ReceiptRow = compiled.passed
    ? {
        label: "If Atlas-4 is unavailable",
        detail: "the request fails, no substitute",
        verdict: "FAILS INSTEAD OF SWITCHING",
        tone: "ok",
        glyph: GLYPH.ok,
      }
    : {
        label: "If Atlas-4 is unavailable",
        detail: "switches to Atlas Mini silently",
        verdict: "NOT WHAT THE GOAL ASKS",
        tone: "bad",
        glyph: GLYPH.bad,
      };

  return [model, fallback];
}
