import {
  Actions,
  DockLocation,
  Layout,
  Model,
  type TabNode,
} from "flexlayout-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import { pagePresentation } from "../../app/shell/presentation";
import { PageView } from "../../features/pages/PageView";
import type { PagesReader, RegisteredPage } from "../../features/pages/service";
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  CaretDownIcon,
  XIcon,
} from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { displaySettings } from "../../team/display/store";
import {
  layoutPages,
  pageTab,
  readWorkspace,
  WORKSPACE_PAGE,
} from "../../team/workspace/layout";
import "../../shared/design-system/styles/flex-workspace.css";

export const inject = ["pages"];

const icons = {
  close: <XIcon size={16} aria-hidden="true" />,
  maximize: <ArrowsOutIcon size={16} aria-hidden="true" />,
  restore: <ArrowsInIcon size={16} aria-hidden="true" />,
  more: <CaretDownIcon size={16} aria-hidden="true" />,
};

type Available = { key: string; title: string; page: RegisteredPage };

const ids = new WeakMap<object, number>();
let nextId = 0;
const identity = (value: unknown) => {
  if (!value || typeof value !== "object") return String(value);
  let id = ids.get(value);
  if (id === undefined) {
    nextId += 1;
    id = nextId;
    ids.set(value, id);
  }
  return `#${id}`;
};

function WorkspacePage({ pages }: { pages: PagesReader }) {
  const all = useSyncExternalStore(pages.subscribe, pages.snapshot);
  const available = useMemo(
    () =>
      all
        .filter((page) => page.primary && page.key !== WORKSPACE_PAGE)
        .map((page) => ({
          key: page.key,
          title: pagePresentation(page).label,
          page,
        })),
    [all],
  );
  const saved = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.workspace,
  );
  // The arrangement is rebuilt when a profile or reset replaces it, or when
  // pages come or go; never by its own saves.
  const own = useRef<unknown>(undefined);
  const external = useRef<unknown>(saved);
  if (saved !== own.current) external.current = saved;
  const keys = available.map((item) => item.key).join("|");
  return (
    <Arrangement
      key={`${identity(external.current)}|${keys}`}
      saved={saved}
      available={available}
      onSave={(json) => {
        own.current = json;
        displaySettings.setWorkspace(json);
      }}
    />
  );
}

function Arrangement({
  saved,
  available,
  onSave,
}: {
  saved: unknown;
  available: readonly Available[];
  onSave(json: unknown): void;
}) {
  const [{ model, missing }] = useState(() => {
    const read = readWorkspace(saved, available);
    return { model: Model.fromJson(read.layout), missing: read.missing };
  });
  const [, rerender] = useState(0);
  const save = (next: Model) => {
    onSave(next.toJson());
    rerender((count) => count + 1);
  };
  const openKeys = new Set(layoutPages(model.toJson()));
  const add = (key: string, title: string) => {
    const target =
      model.getActiveTabset()?.getId() ?? model.getRootRow()?.getId();
    if (!target) return;
    model.doAction(
      Actions.addNode(
        pageTab(key, title),
        target,
        model.getActiveTabset() ? DockLocation.CENTER : DockLocation.RIGHT,
        -1,
      ),
    );
  };
  const factory = (node: TabNode) => {
    const key = (node.getConfig() as { key?: string } | undefined)?.key;
    const page = available.find((item) => item.key === key)?.page;
    return page ? (
      <div className="h-full min-h-0 overflow-auto">
        <PageView page={page} />
      </div>
    ) : (
      <p className="p-4 text-muted" data-no-translate="">
        이 패널의 화면이 이번 버전에 없어요. 탭을 닫아 주세요.
      </p>
    );
  };
  return (
    <div
      className="flex-workspace-comparison flex h-full min-h-0 flex-col"
      style={{ gap: "var(--space-2)", padding: "var(--space-2)" }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted">패널 추가:</span>
        {available
          .filter((item) => !openKeys.has(item.key))
          .map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant="subtle"
              onClick={() => add(item.key, item.title)}
            >
              + {item.title}
            </Button>
          ))}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="subtle"
          onClick={() =>
            // A fresh value each time, so the arrangement rebuilds even from the default.
            displaySettings.setWorkspace({ reset: Date.now() })
          }
        >
          배치 원래대로
        </Button>
      </div>
      {missing > 0 && (
        <p className="text-muted">
          저장된 배치의 패널 {missing}개는 이번 버전에 없어서 빠졌어요.
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <Layout
          model={model}
          factory={factory}
          icons={icons}
          realtimeResize
          onModelChange={save}
        />
      </div>
    </div>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.pages.register({
    id: "workspace",
    title: "Work area",
    primary: true,
    placement: "topbar",
    layout: "workspace",
    component: () => <WorkspacePage pages={ctx.pages} />,
  });
};
