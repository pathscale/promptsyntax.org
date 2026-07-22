import { Tabs } from "@pathscale/ui";
import { type Component, For } from "solid-js";

type Lens = {
  id: string;
  label: string;
  eyebrow: string;
  heading: string;
  lede: string;
  points: string[];
};

const LENSES: Lens[] = [
  {
    id: "user",
    label: "User",
    eyebrow: "For everyday use",
    heading: "Know what actually happened",
    lede: "You never have to wonder what the AI did with your request.",
    points: [
      "See which model actually answered, not just the one you picked.",
      "Find out whether it really searched the web or opened the file you meant.",
      "Get told, in plain language, when a setting you chose was ignored.",
      "Type nothing special and it still works. The control is there when you want it, not a tax when you do not.",
    ],
  },
  {
    id: "power",
    label: "Power User",
    eyebrow: "For builders and power users",
    heading: "Say exactly what you mean, once",
    lede: "Bind the model, the tools, and the fallback, then get a receipt proving it ran that way.",
    points: [
      "Require a specific model and fail rather than accept a silent swap.",
      "Set a time or cost budget with a defined fallback if it is exceeded.",
      "Write one portable prompt instead of relearning every vendor's buttons.",
      "Inspect the fully assembled prompt before you send it.",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    eyebrow: "For enterprise and IT",
    heading: "Govern AI use, and prove it",
    lede: "Your existing policy engine decides on the real request, and every decision leaves evidence.",
    points: [
      "Pin requests to approved models by immutable version, not a drifting alias.",
      "Keep confidential data from falling back to an unapproved provider.",
      "Turn an admin setting into per request proof that the policy was honored.",
      "Make conformance a procurement requirement, so you buy on evidence, not promises.",
    ],
  },
  {
    id: "auditor",
    label: "Auditor",
    eyebrow: "For audit and assurance",
    heading: "Test evidence against intent",
    lede: "For the first time, a record of what was asked, not only what happened.",
    points: [
      "Compare requested versus filled for model, parameters, tools, and context.",
      "Trace which document or tool result entered the prompt, with its provenance.",
      "Read a tamper evident record that is honest about what it can and cannot prove.",
      "Reconcile against gateway or billing logs rather than trusting a single source.",
    ],
  },
  {
    id: "regulator",
    label: "Regulator",
    eyebrow: "For oversight",
    heading: "A substrate for oversight",
    lede: "Standardized, per request records that a jurisdiction profile can build on.",
    points: [
      "One consistent evidence format across vendors, not a pile of proprietary logs.",
      "Records built to last as evidence: integrity chaining, gap detection, retention metadata.",
      "Tiered visibility that respects confidentiality while still proving presence.",
      "A clean seam for record keeping mandates that today lack a defined format.",
    ],
  },
  {
    id: "vendor",
    label: "Vendor",
    eyebrow: "For model providers and platforms",
    heading: "Make trust a feature you ship",
    lede: "You already build the pieces. PromptSyntax gives them shared meaning, so they interoperate instead of fragmenting.",
    points: [
      "Adopt one layer at a time. A receipt lowers onto the OpenTelemetry spans you already emit, so the cost is low.",
      "Turn substitution notices, fallback, and tool traces into a standard that buyers can require and compare.",
      "Get ahead of record keeping rules with a defined format, instead of building a bespoke compliance layer later.",
      "Compete on transparency. Let customers choose you because they can see exactly what you did with their request.",
    ],
  },
];

const LensTabs: Component = () => (
  <section class="border-base-300 border-b">
    <div class="py-16 content-container">
      <h2 class="mb-7 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">PromptSyntax Impact</h2>
      <Tabs defaultSelectedKey="user" variant="primary">
        <Tabs.List aria-label="Choose your lens">
          <For each={LENSES}>{(lens) => <Tabs.Tab id={lens.id}>{lens.label}</Tabs.Tab>}</For>
        </Tabs.List>
        <For each={LENSES}>
          {(lens) => (
            <Tabs.Panel id={lens.id}>
              <div class="mt-6 min-h-[300px] rounded-xl border border-base-300 bg-base-200 p-6">
                <div class="mb-2 font-medium text-primary text-xs uppercase tracking-wider">
                  {lens.eyebrow}
                </div>
                <h3 class="mb-2 font-semibold text-xl">{lens.heading}</h3>
                <p class="mb-4 text-base-content/60">{lens.lede}</p>
                <ul class="m-0 list-none p-0">
                  <For each={lens.points}>
                    {(point) => (
                      <li class="relative border-base-300 border-b py-2.5 pl-7 text-[15px] text-base-content/70 before:absolute before:left-0 before:text-primary before:content-['→'] last:border-b-0">
                        {point}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Tabs.Panel>
          )}
        </For>
      </Tabs>
    </div>
  </section>
);

export default LensTabs;
