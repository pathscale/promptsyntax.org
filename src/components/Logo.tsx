import type { Component } from "solid-js";

export const Logo: Component<{ class?: string }> = (props) => (
  <span class={`font-bold text-base-content tracking-tight ${props.class ?? ""}`}>
    Prompt<span class="text-primary">Syntax</span>
  </span>
);

export default Logo;
