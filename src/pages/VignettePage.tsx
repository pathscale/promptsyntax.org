import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import VignetteTask, { type TaskResult } from "~/components/VignetteTask";

function completionCode(payload: TaskResult): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function VignettePage(): JSX.Element {
  const [result, setResult] = createSignal<TaskResult | null>(null);
  const [copied, setCopied] = createSignal(false);

  const complete = (payload: TaskResult): void => {
    setResult(payload);
    window.parent.postMessage({ type: "ps-vignette-result", payload }, "*");
  };

  const copyCode = async (): Promise<void> => {
    const payload = result();
    if (!payload) return;
    await navigator.clipboard.writeText(completionCode(payload));
    setCopied(true);
  };

  return (
    <div class="vignette-page">
      <section class="vignette-shell" aria-labelledby="vignette-title">
        <VignetteTask onComplete={complete} />

        <Show when={result()}>
          {(payload) => (
            <section class="vignette-complete" aria-live="polite">
              <h2>{payload().passed ? "Complete" : "Task ended"}</h2>
              <p>
                {payload().passed
                  ? "Your compiled prompt keeps the precise model and fails closed."
                  : "Your response has been recorded."}
              </p>
              <label for="completion-code">Completion code</label>
              <div>
                <input
                  id="completion-code"
                  readonly
                  value={completionCode(payload())}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" onClick={() => void copyCode()}>
                  {copied() ? "Copied" : "Copy"}
                </button>
              </div>
            </section>
          )}
        </Show>
      </section>
    </div>
  );
}

export default VignettePage;
