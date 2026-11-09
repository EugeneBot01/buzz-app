import {
  Actions,
  DockLocation,
  Layout,
  Model,
  type TabNode,
} from "flexlayout-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { pagePresentation } from "../../app/shell/presentation";
import { PageView } from "../../features/pages/PageView";
import type { PagesReader, RegisteredPage } from "../../features/pages/service";
import { useChannelList, useRelayConnection } from "../../features/relay/react";
import type { RelayData } from "../../features/relay/service";
import { readView, writeView } from "../../shared/view-state";
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  CaretDownIcon,
  XIcon,
} from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { Select } from "../../shared/design-system/ui/Select";
import { ALWAYS_SHOWN_TAB } from "../../team/display/settings";
import { displaySettings } from "../../team/display/store";
import {
  layoutPages,
  pageTab,
  readWorkspace,
  WORKSPACE_PAGE,
} from "../../team/workspace/layout";
import "../../shared/design-system/styles/flex-workspace.css";

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

/** Loaded only when the Work area opens, with its layout library and styles. */
export default function WorkspacePage({
  pages,
  relay,
}: {
  pages: PagesReader;
  relay: RelayData;
}) {
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
      relay={relay}
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
  relay,
  onSave,
}: {
  saved: unknown;
  available: readonly Available[];
  relay: RelayData;
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
      key === ALWAYS_SHOWN_TAB ? (
        <MessagesPanel page={page} relay={relay} />
      ) : (
        <div className="h-full min-h-0 overflow-auto">
          <PageView page={page} />
        </div>
      )
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
          // A panel is named like its top tab today, not as it was saved.
          onRenderTab={(node, values) => {
            const key = (node.getConfig() as { key?: string } | undefined)?.key;
            const title = available.find((item) => item.key === key)?.title;
            if (title) values.content = title;
          }}
          icons={icons}
          realtimeResize
          onModelChange={save}
        />
      </div>
    </div>
  );
}

/**
 * The Messages panel shows one chat of its own. The left sidebar opens the
 * Messages tab; this picker switches the chat while staying in Work area.
 */
function MessagesPanel({
  page,
  relay,
}: {
  page: RegisteredPage;
  relay: RelayData;
}) {
  const connection = useRelayConnection(relay);
  const scope = connection.scope;
  const { channels } = useChannelList(connection.session.channels);
  // The Messages page opens the chat saved as selected for this community.
  const [shown, setShown] = useState<string | undefined>(() =>
    scope ? readView(scope, "selected-channel", undefined) : undefined,
  );
  const choices = channels.filter(
    (channel) =>
      !channel.archived && !channel.huddle && channel.channelType !== "system",
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {scope && choices.length > 0 && (
        <div className="shrink-0 p-1" data-no-translate="">
          <Select
            variant="compact"
            label="채널"
            value={shown ?? ""}
            groups={[
              {
                label: "채널",
                options: choices.map((channel) => ({
                  value: channel.id,
                  label: channel.name || "대화",
                })),
              },
            ]}
            onValueChange={(id) => {
              writeView(scope, "selected-channel", id);
              setShown(id);
            }}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Reopened per chat, so it reads the newly saved selection. */}
        <PageView key={shown ?? "saved"} page={page} />
      </div>
    </div>
  );
}
