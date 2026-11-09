import { lazy, Suspense } from "react";
import type { PluginModule } from "../../plugins/api";

export const inject = ["pages", "relay"];

// The layout library and its styles load the first time Work area opens.
const WorkspacePage = lazy(() => import("./WorkspacePage"));

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.pages.register({
    id: "workspace",
    title: "Work area",
    primary: true,
    placement: "topbar",
    layout: "workspace",
    component: () => (
      <Suspense fallback={null}>
        <WorkspacePage pages={ctx.pages} relay={ctx.relay} />
      </Suspense>
    ),
  });
};
