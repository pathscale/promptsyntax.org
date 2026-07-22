import type { Component } from "solid-js";
import { SPEC_PDF } from "~/config/routes";
import specHtml from "~/content/spec.html?raw";
import DocPage from "~/pages/DocPage";

const SpecPage: Component = () => (
  <DocPage html={specHtml} pdfHref={SPEC_PDF} pdfLabel="Download PDF" />
);

export default SpecPage;
