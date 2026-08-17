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
 * The two goals, one row each, and each row has two ways to satisfy it.
 *
 * The composer settles it directly: the model dropdown answers which model
 * runs, and the enforce toggle answers what happens when that model cannot.
 * Writing the same thing into the prompt answers it too, which is the point of
 * the task, since the settings and the request are two routes to one outcome.
 */
export type ReceiptState = {
  rows: ReceiptRow[];
  /** True when both goals are met, by either route. */
  passed: boolean;
};

export function receiptState(
  compiled: Compilation,
  dropdown: ComposerModel,
  forceModel: boolean,
): ReceiptState {
  const bound = compiled.steps[0]?.canonical;

  // Goal one: Atlas-4 is the model that answers.
  const modelMet = bound === PRECISE_MODEL || (dropdown === "atlas-4" && bound !== MINI_MODEL);

  const model: ReceiptRow =
    bound === PRECISE_MODEL
      ? {
          label: "Model",
          detail: "Atlas-4, pinned in the prompt",
          verdict: "GOAL MET",
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
        : dropdown === "atlas-4"
          ? {
              label: "Model",
              detail: "Atlas-4, selected for this request",
              verdict: "GOAL MET",
              tone: "ok",
              glyph: GLYPH.ok,
            }
          : dropdown === "atlas-mini"
            ? {
                label: "Model",
                detail: "Atlas Mini, selected for this request",
                verdict: "NOT WHAT THE GOAL ASKS",
                tone: "bad",
                glyph: GLYPH.bad,
              }
            : {
                label: "Model",
                detail: "no model chosen, the service picks under load",
                verdict: "WOULD SWITCH",
                tone: "warn",
                glyph: GLYPH.warn,
              };

  // Goal two: rather than substitute, the request fails.
  const fallbackMet = compiled.passed || forceModel;

  const fallback: ReceiptRow = fallbackMet
    ? {
        label: "If Atlas-4 is unavailable",
        detail: compiled.passed
          ? "the request fails, no substitute"
          : "the request fails, the model choice is enforced",
        verdict: "GOAL MET",
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

  return { rows: [model, fallback], passed: modelMet && fallbackMet };
}
