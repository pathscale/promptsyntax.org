import { type DirectiveSegment, PromptSyntaxParser, type Reference } from "promptsyntax";

export const PRECISE_MODEL = "model:atlas/atlas-4@2026-06-01";
export const MINI_MODEL = "model:atlas/atlas-mini@2026-06-01";

const REGISTRY = new Map<string, string[]>([
  ["atlas-4", [PRECISE_MODEL]],
  ["precise", [PRECISE_MODEL]],
  ["atlas-mini", [MINI_MODEL]],
  ["fast", [MINI_MODEL]],
]);

export const VIGNETTE_PARSER = new PromptSyntaxParser({
  entities: REGISTRY.keys(),
  actions: ["concise"],
});

type RouteStep = { canonical: string; strict: boolean };

export type Compilation = {
  source: string;
  directives: DirectiveSegment[];
  dataPlane: string;
  steps: RouteStep[];
  terminal: "ask" | "fail" | null;
  errors: string[];
  canonicalForm: string;
  passed: boolean;
};

function resolveReference(reference: Reference): { canonical?: string; error?: string } {
  const key = reference.name.toLocaleLowerCase();
  const candidates = REGISTRY.get(key) ?? [];
  if (candidates.length === 0) return { error: `Unknown model reference: @${reference.name}` };
  if (candidates.length > 1) return { error: `Ambiguous model reference: @${reference.name}` };
  return { canonical: candidates[0] };
}

function frontmatterSteps(body: string): { steps: RouteStep[]; errors: string[] } {
  const steps: RouteStep[] = [];
  const errors: string[] = [];
  const modelPattern = /\bmodel\s*:\s*["']([^"']+)["']/gu;
  for (const match of body.matchAll(modelPattern)) {
    const value = match[1];
    if (!value) continue;
    const canonical = [...REGISTRY.values()].flat().includes(value)
      ? value
      : REGISTRY.get(value.toLocaleLowerCase())?.[0];
    if (canonical) steps.push({ canonical, strict: true });
    else errors.push(`Unknown model reference: ${value}`);
  }
  return { steps, errors };
}

function canonicalize(steps: RouteStep[], terminal: "ask" | "fail" | null, body: string): string {
  if (steps.length === 0) return "";
  const route = steps
    .map(
      (step) => `  - { model: "${step.canonical}", fill: ${step.strict ? "strict" : "partial"} }`,
    )
    .join("\n");
  const terminalLine = terminal ? `\nterminal: ${terminal}` : "";
  return `---ps\nversion: "0.2"\nroute:\n${route}${terminalLine}\n---\n${body.trimStart()}`;
}

function unrecognizedReferences(source: string, directives: DirectiveSegment[]): string[] {
  const covered = (at: number) =>
    directives.some((directive) => at >= directive.span.start && at < directive.span.end);
  const errors: string[] = [];
  const pattern = /(^|\s)(@[\p{L}_][\p{L}\p{N}_.-]*)/gu;
  for (const match of source.matchAll(pattern)) {
    const token = match[2];
    if (!token) continue;
    const at = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (!covered(at)) errors.push(`Unknown model reference: ${token}`);
  }
  return errors;
}

/** Compile only against the vignette's pinned mock environment. */
export function compileVignette(source: string): Compilation {
  const parsed = VIGNETTE_PARSER.parse(source);
  const steps: RouteStep[] = [];
  let terminal: "ask" | "fail" | null = null;
  const errors = parsed.diagnostics.map((diagnostic) => diagnostic.message);

  const addReference = (reference: Reference): void => {
    const resolved = resolveReference(reference);
    if (resolved.canonical) steps.push({ canonical: resolved.canonical, strict: true });
    else if (resolved.error) errors.push(resolved.error);
  };

  for (const segment of parsed.directives) {
    const directive = segment.directive;
    if (directive.kind === "reference") addReference(directive.reference);
    if (directive.kind === "route") {
      for (const step of directive.route.steps) addReference(step.reference);
      terminal = directive.route.terminal;
    }
    if (directive.kind === "frontmatter") {
      const frontmatter = frontmatterSteps(directive.body);
      steps.push(...frontmatter.steps);
      errors.push(...frontmatter.errors);
      const terminalMatch = /\bterminal\s*:\s*(ask|fail)\b/u.exec(directive.body);
      if (terminalMatch?.[1] === "ask" || terminalMatch?.[1] === "fail") {
        terminal = terminalMatch[1];
      }
    }
  }

  errors.push(...unrecognizedReferences(source, parsed.directives));
  const uniqueErrors = [...new Set(errors)];
  if (steps.length === 0 && uniqueErrors.length === 0) {
    uniqueErrors.push("No model is fixed. Under load, the service may substitute Atlas Mini.");
  }
  const passed =
    uniqueErrors.length === 0 &&
    steps.length > 0 &&
    steps[0]?.canonical === PRECISE_MODEL &&
    steps.every((step) => step.canonical === PRECISE_MODEL && step.strict);
  return {
    source,
    directives: parsed.directives,
    dataPlane: parsed.dataPlane,
    steps,
    terminal,
    errors: uniqueErrors,
    canonicalForm: canonicalize(steps, terminal, parsed.dataPlane),
    passed,
  };
}
