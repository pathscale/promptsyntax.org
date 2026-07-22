import type { Component } from "solid-js";
import { SYNTAX_PDF } from "~/config/routes";
import syntaxHtml from "~/content/syntax.html?raw";
import DocPage from "~/pages/DocPage";

const SyntaxPage: Component = () => (
  <DocPage html={syntaxHtml} pdfHref={SYNTAX_PDF} pdfLabel="Download PDF" />
);

export default SyntaxPage;
