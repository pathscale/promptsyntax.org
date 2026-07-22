import { Button } from "@pathscale/ui";
import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import { GITHUB_URL, ROUTES } from "~/config/routes";

const HomePage: Component = () => (
  <div>
    <div class="hero-glow border-base-300 border-b">
      <div class="py-20 pb-16 content-container">
        <span class="mb-6 inline-block rounded-full border border-base-300 px-3 py-1 text-secondary text-xs tracking-wide">
          DRAFT SPECIFICATION · v0.2.1
        </span>
        <h1 class="mb-4 font-bold text-[clamp(30px,5vw,50px)] leading-[1.1] tracking-tight">
          Every prompt deserves a receipt.
        </h1>
        <p class="mb-8 max-w-[680px] text-[clamp(18px,2.4vw,21px)] text-base-content/70">
          When you ask an AI to do something, you can't see what your request became, can't
          guarantee which model or tools ran, and aren't told when something was silently changed.
          Prompt Syntax is a vendor-neutral proposal to fix that, at the layer where you type.
        </p>
        <div class="flex flex-wrap gap-3">
          <A href={ROUTES.SPEC}>
            <Button variant="primary" type="button">
              Read the specification
            </Button>
          </A>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" type="button">
              View on GitHub
            </Button>
          </a>
        </div>
      </div>
    </div>

    <section class="border-base-300 border-b">
      <div class="py-16 content-container">
        <h2 class="mb-2 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">What it is</h2>
        <p class="mb-7 text-base-content/60 text-sm">
          Your prompt stays plain language. Optional <em>syntax islands</em> add control that a
          novice can ignore and an expert can rely on.
        </p>
        <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-200">
          <div class="flex gap-2 border-base-300 border-b bg-base-300/60 px-4 py-3">
            <span class="h-3 w-3 rounded-full bg-error" />
            <span class="h-3 w-3 rounded-full bg-warning" />
            <span class="h-3 w-3 rounded-full bg-success" />
          </div>
          <pre class="m-0 overflow-x-auto p-5 font-mono text-[14.5px] leading-[1.7]">
            <span class="isl-model">@opus!(temperature: 0.2)</span>{" "}
            <span class="isl-pol">limit(wall_time: 5s)</span> <span class="isl-com">else</span>{" "}
            <span class="isl-model">@haiku</span>
            {"\n"}Summarize <span class="isl-file">@file:q3-report.md</span>{" "}
            <span class="isl-skill">/concise</span>
          </pre>
        </div>
        <p class="mt-4 mb-4 text-base-content/60 text-sm">
          Read it as a sentence, or read every island: use the precise model at low creativity, give
          up after 5 seconds and fall back to a faster one, include this exact file, and summarize
          concisely. Then you get a receipt:
        </p>
        <div class="rounded-xl border border-base-300 border-dashed bg-warning/5 px-4 py-4">
          <h4 class="mb-2 font-semibold text-warning text-xs uppercase tracking-wider">
            Execution receipt: what actually ran
          </h4>
          <div class="flex justify-between gap-4 border-base-300/50 border-b py-1.5 font-mono text-sm">
            <span>model → opus (strict)</span>
            <span class="text-success">✓ filled</span>
          </div>
          <div class="flex justify-between gap-4 border-base-300/50 border-b py-1.5 font-mono text-sm">
            <span>temperature 0.2</span>
            <span class="text-success">✓ applied</span>
          </div>
          <div class="flex justify-between gap-4 border-base-300/50 border-b py-1.5 font-mono text-sm">
            <span>file: q3-report.md</span>
            <span class="text-success">✓ included in full</span>
          </div>
          <div class="flex justify-between gap-4 border-base-300/50 border-b py-1.5 font-mono text-sm">
            <span>/concise</span>
            <span class="text-success">✓ applied</span>
          </div>
          <div class="flex justify-between gap-4 py-1.5 font-mono text-sm">
            <span>latency budget 5s</span>
            <span class="text-warning">⚠ 4.1s (within budget)</span>
          </div>
        </div>
        <p class="mt-6 text-base-content/50 text-xs">
          Requested → applied, per requirement, with a typed reason for anything that changed. No
          silent substitution. No silent drop. No silent anything.
        </p>
      </div>
    </section>

    <section class="border-base-300 border-b">
      <div class="py-16 content-container">
        <h2 class="mb-2 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">Why it matters</h2>
        <p class="mb-7 text-base-content/60 text-sm">
          The problem is small today and compounding fast.
        </p>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border border-error/30 bg-base-200 p-5">
            <h4 class="mb-2 font-semibold text-[15px] text-error">Today</h4>
            <p class="text-[14.5px] text-base-content/70">
              The same{" "}
              <code class="rounded border border-base-300 bg-base-300 px-1.5 font-mono text-[13px]">
                @
              </code>{" "}
              means <em>attach a file</em> in one product, <em>switch agents</em> in another, and{" "}
              <em>maybe use a tool</em> in a third. Your model can be swapped for a cheaper one
              mid-request. A setting you chose can be dropped without a word. A safety filter can
              reroute you and you won't know which file triggered it. And increasingly, this happens
              while you're not even watching.
            </p>
          </div>
          <div class="rounded-xl border border-success/30 bg-base-200 p-5">
            <h4 class="mb-2 font-semibold text-[15px] text-success">With Prompt Syntax</h4>
            <p class="text-[14.5px] text-base-content/70">
              One grammar means the same thing everywhere. What you ask for is either honored or
              you're told exactly what changed and why, in a standard, readable receipt. You can
              require a model and fail rather than substitute. You can see the assembled context
              before it's sent. The interface becomes accountable.
            </p>
          </div>
        </div>
        <p class="mt-6 max-w-[760px] text-base-content/50 text-xs">
          Prompt Syntax makes a narrow, honest promise:{" "}
          <b class="text-base-content/80">
            portable expression of intent and transparent resolution
          </b>
          , not identical behavior across every vendor, and not a claim about what happens inside
          the model. It draws the line between what an interface can guarantee and what it cannot,
          and it never pretends otherwise.
        </p>
      </div>
    </section>

    <section class="border-base-300 border-b">
      <div class="py-16 content-container">
        <h2 class="mb-2 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">Who it's for</h2>
        <p class="mb-7 text-base-content/60 text-sm">
          One language, one receipt, read differently by each audience.
        </p>
        <div class="grid gap-4 md:grid-cols-3">
          <div class="rounded-xl border border-base-300 bg-base-200 p-5">
            <div class="mb-2 font-medium text-primary text-xs uppercase tracking-wider">
              Everyday users
            </div>
            <h3 class="mb-2 font-semibold text-lg">Know what happened</h3>
            <p class="text-[15px] text-base-content/70">
              Did it actually search the web? Which file did it use? Was the model you picked the
              one that answered? The receipt tells you, in plain terms, only when something's worth
              knowing. Type nothing special and it still works; the syntax is there when you want
              control, not a tax when you don't.
            </p>
          </div>
          <div class="rounded-xl border border-base-300 bg-base-200 p-5">
            <div class="mb-2 font-medium text-primary text-xs uppercase tracking-wider">
              Enterprises &amp; IT
            </div>
            <h3 class="mb-2 font-semibold text-lg">Govern and prove it</h3>
            <p class="text-[15px] text-base-content/70">
              Bind requests to approved models by immutable version. Keep confidential data from
              falling back to an unapproved provider. Let your existing policy engine decide on the
              real request (references, data labels, the whole fallback chain) and get per-request{" "}
              <em>evidence</em> that the decision was honored, not just a setting that hopes it was.
            </p>
          </div>
          <div class="rounded-xl border border-base-300 bg-base-200 p-5">
            <div class="mb-2 font-medium text-primary text-xs uppercase tracking-wider">
              Vendors &amp; platforms
            </div>
            <h3 class="mb-2 font-semibold text-lg">Compete on trust</h3>
            <p class="text-[15px] text-base-content/70">
              You already ship the pieces: substitution notices, tool traces, fallback. PS gives
              them shared semantics so they interoperate instead of fragmenting. Adopt per layer; a
              receipt lowers onto the OpenTelemetry spans you already emit. Transparency becomes
              something you can advertise, and conformance something a customer can require.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="border-base-300 border-b">
      <div class="py-16 content-container">
        <h2 class="mb-6 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">
          How it works, briefly
        </h2>
        <ul class="m-0 list-none p-0">
          <li class="relative border-base-300 border-b py-2.5 pl-7 text-[15.5px] text-base-content/70 before:absolute before:left-0 before:text-primary before:content-['→']">
            <b class="text-base-content">Three scopes, one grammar.</b> A directive can target a
            point in the prompt, a span of it, or the whole document, all using the same{" "}
            <code class="rounded border border-base-300 bg-base-300 px-1.5 font-mono text-[13px]">
              @
            </code>
            -reference syntax.
          </li>
          <li class="relative border-base-300 border-b py-2.5 pl-7 text-[15.5px] text-base-content/70 before:absolute before:left-0 before:text-primary before:content-['→']">
            <b class="text-base-content">Casual and strict are the same thing.</b> A loose one-liner
            and a fully-specified document compile to one canonical form. Progressive disclosure is
            a property of the language, not a mode you switch.
          </li>
          <li class="relative border-base-300 border-b py-2.5 pl-7 text-[15.5px] text-base-content/70 before:absolute before:left-0 before:text-primary before:content-['→']">
            <b class="text-base-content">Fulfillment has contracts.</b> Borrowed from stock-exchange
            order types: <em>strict</em> (do it exactly or fail), <em>partial</em> (do what you can,
            report the rest), <em>best-effort</em>. Plus budgets and declarative fallback.
          </li>
          <li class="relative border-base-300 border-b py-2.5 pl-7 text-[15.5px] text-base-content/70 before:absolute before:left-0 before:text-primary before:content-['→']">
            <b class="text-base-content">Authority is layered and safe.</b> Prompt content can
            narrow what's allowed but never expand it. Injected content from documents or tools is
            treated as data, never as commands. It's the discipline that ended SQL injection,
            applied to prompts.
          </li>
          <li class="relative py-2.5 pl-7 text-[15.5px] text-base-content/70 before:absolute before:left-0 before:text-primary before:content-['→']">
            <b class="text-base-content">The receipt is the point.</b> A tiered, machine-readable
            record: what was compiled, how it resolved, what was requested versus what was filled.
            Readable by a person; verifiable by a machine.
          </li>
        </ul>
        <p class="mt-7">
          <A href={ROUTES.SPEC}>
            <Button variant="primary" type="button">
              Read the full specification →
            </Button>
          </A>
        </p>
      </div>
    </section>

    <section>
      <div class="py-16 content-container">
        <h2 class="mb-2 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">
          Status &amp; scope
        </h2>
        <p class="mb-7 text-base-content/60 text-sm">Honest about what this is.</p>
        <p class="max-w-[720px] text-base-content/70">
          Prompt Syntax is a{" "}
          <b class="text-base-content">draft specification (v0.2.1), pre-implementation.</b> A
          reference implementation and a formative multi-stakeholder study are in progress, and an
          academic paper is in preparation. This is a proposal seeking scrutiny, especially from
          operators, administrators, compliance practitioners, and anyone who has been silently
          rerouted and wanted to know why. It does not decide what is safe, it does not override
          platform policy or law, and it does not claim to see inside the model. It makes the
          interface legible. Nothing more, and nothing less.
        </p>
        <p class="mt-6">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" type="button">
              Contribute on GitHub
            </Button>
          </a>
        </p>
      </div>
    </section>
  </div>
);

export default HomePage;
