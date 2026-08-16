import { createRouter } from "@solidjs/router";
import type { ParentComponent } from "solid-js";

import Footer from "~/components/Footer";
import SiteNavbar from "~/components/SiteNavbar";
import { ROUTES } from "~/config/routes";
import HomePage from "~/pages/HomePage";
import SpecPage from "~/pages/SpecPage";
import StudyPage from "~/pages/StudyPage";
import SyntaxPage from "~/pages/SyntaxPage";
import VignettePage from "~/pages/VignettePage";

const Shell: ParentComponent = (props) => (
  <div class="flex min-h-screen flex-col">
    <SiteNavbar />
    <main class="flex-1">{props.children}</main>
    <Footer />
  </div>
);

/** Bare shell for the unlisted study: no navigation, no footer, no outbound links. */
const BareShell: ParentComponent = (props) => (
  <div class="flex min-h-screen flex-col">
    <main class="flex-1">{props.children}</main>
  </div>
);

const Router = createRouter({
  routes: [
    {
      component: BareShell,
      children: [{ path: ROUTES.STUDY, component: StudyPage }],
    },
    {
      component: Shell,
      children: [
        { path: ROUTES.HOME, component: HomePage },
        { path: ROUTES.SPEC, component: SpecPage },
        { path: ROUTES.SYNTAX, component: SyntaxPage },
        { path: ROUTES.VIGNETTE, component: VignettePage },
        { path: "*", component: HomePage },
      ],
    },
  ],
});

const App = () => <Router />;

export default App;
