import { Route, Router } from "@solidjs/router";
import type { ParentComponent } from "solid-js";

import Footer from "~/components/Footer";
import SiteNavbar from "~/components/SiteNavbar";
import { ROUTES } from "~/config/routes";
import HomePage from "~/pages/HomePage";
import SpecPage from "~/pages/SpecPage";
import SyntaxPage from "~/pages/SyntaxPage";

const Shell: ParentComponent = (props) => (
  <div class="flex min-h-screen flex-col">
    <SiteNavbar />
    <main class="flex-1">{props.children}</main>
    <Footer />
  </div>
);

const App = () => {
  return (
    <Router root={Shell}>
      <Route path={ROUTES.HOME} component={HomePage} />
      <Route path={ROUTES.SPEC} component={SpecPage} />
      <Route path={ROUTES.SYNTAX} component={SyntaxPage} />
      <Route path="*" component={HomePage} />
    </Router>
  );
};

export default App;
