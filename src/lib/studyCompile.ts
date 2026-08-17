import { type Compilation, compileVignette, MINI_MODEL, PRECISE_MODEL } from "~/lib/vignette";

/**
 * The study's control surface, compiled.
 *
 * Participants never write notation: the dropdown and the toggle are the only
 * inputs, and this module turns them into the same source text a hand-written
 * solution would produce, then hands it to the one compiler that decides
 * everything else. Every receipt row and the check button read the compiled
 * value, so nothing on the screen can disagree with the record.
 */

export const STUDY_PROMPT = "Summarize the attached Q3 report. Keep it concise.";

export type StudyModel = "atlas-4" | "atlas-mini";

const CANONICAL: Record<StudyModel, string> = {
  "atlas-4": PRECISE_MODEL,
  "atlas-mini": MINI_MODEL,
};

/** The label the participant sees for a selection, used in receipt prose. */
export const MODEL_LABEL: Record<StudyModel, string> = {
  "atlas-4": "Atlas-4",
  "atlas-mini": "Atlas Mini",
};

/**
 * Settings to prompt source.
 *
 * Toggle off means no binding at all: the request carries nothing, so the
 * service keeps its default and may substitute. Toggle on pins the selection
 * with a strict fill and a fail terminal, which is the whole of the goal.
 */
export function studySource(model: StudyModel, mustUse: boolean): string {
  if (!mustUse) return STUDY_PROMPT;
  return [
    "---ps",
    'version: "0.2"',
    "route:",
    `  - { model: "${CANONICAL[model]}", fill: strict }`,
    "terminal: fail",
    "---",
    STUDY_PROMPT,
  ].join("\n");
}

export function compileStudy(model: StudyModel, mustUse: boolean): Compilation {
  return compileVignette(studySource(model, mustUse));
}

/**
 * Does the compiled record meet the goal?
 *
 * Both halves come from the compilation, never from the widget flags. The
 * compiler's own `passed` settles the model half; the terminal settles the
 * other, since pinning a model without a fail terminal still leaves the
 * service free to substitute when that model cannot answer.
 */
export function meetsGoal(compiled: Compilation): boolean {
  return compiled.passed && compiled.terminal === "fail" && compiled.canonicalForm.length > 0;
}

export type StudyRowTone = "ok" | "warn" | "bad";

export type StudyRow = {
  label: string;
  detail: string;
  verdict: string;
  tone: StudyRowTone;
  glyph: string;
};

const GLYPH: Record<StudyRowTone, string> = { ok: "✓", warn: "!", bad: "✗" };

/**
 * The live receipt, in plain words.
 *
 * Read from the compiled route rather than the controls, so the receipt
 * describes the record that would actually be sent. Word and glyph carry the
 * verdict; colour only repeats it.
 */
export function studyRows(compiled: Compilation, selection: StudyModel): StudyRow[] {
  const bound = compiled.steps[0]?.canonical;
  const goalMet = meetsGoal(compiled);

  const model: StudyRow =
    bound === PRECISE_MODEL
      ? {
          label: "Model",
          detail: "Atlas-4, required",
          verdict: "EXACTLY AS ASKED",
          tone: "ok",
          glyph: GLYPH.ok,
        }
      : bound === MINI_MODEL
        ? {
            label: "Model",
            detail: "Atlas Mini, required",
            verdict: "NOT WHAT THE GOAL ASKS",
            tone: "bad",
            glyph: GLYPH.bad,
          }
        : {
            label: "Model",
            detail: `dropdown asks for ${MODEL_LABEL[selection]}, service may still switch under load`,
            verdict: "WOULD SWITCH",
            tone: "warn",
            glyph: GLYPH.warn,
          };

  const fallback: StudyRow = goalMet
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
