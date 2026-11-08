/**
 * Workspace (Buzz Team): app pages arranged as panels, Premiere Pro style.
 * The arrangement is FlexLayout JSON; every panel names a page by key, so a
 * saved arrangement survives updates and only panels whose page is gone
 * are left out.
 */
import type { IJsonModel, IJsonRowNode, IJsonTabNode } from "flexlayout-react";

export const WORKSPACE_PAGE = "buzz.team.workspace/workspace";
const MESSAGES = "buzz.channels/channels";
const MAX_PANELS = 12;

export const pageTab = (key: string, name: string): IJsonTabNode => ({
  type: "tab",
  id: `page:${key}`,
  name,
  component: "page",
  config: { key },
});

export function defaultWorkspace(
  pages: readonly { key: string; title: string }[],
): IJsonModel {
  const messages = pages.find((page) => page.key === MESSAGES);
  const second = pages.find(
    (page) => page.key !== MESSAGES && page.key !== WORKSPACE_PAGE,
  );
  const tabsets = [messages, second].flatMap((page, index) =>
    page
      ? [
          {
            type: "tabset" as const,
            weight: index === 0 ? 60 : 40,
            children: [pageTab(page.key, page.title)],
          },
        ]
      : [],
  );
  return {
    global: { tabEnableClose: true, tabEnableRename: false },
    borders: [],
    layout: { type: "row", children: tabsets },
  };
}

/** The page keys a layout shows, in order, at most once each. */
export function layoutPages(layout: IJsonModel): string[] {
  const keys: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const { type, config, children } = node as {
      type?: unknown;
      config?: { key?: unknown };
      children?: unknown;
    };
    if (type === "tab" && typeof config?.key === "string")
      keys.push(config.key);
    if (Array.isArray(children)) for (const child of children) walk(child);
  };
  walk(layout.layout);
  return [...new Set(keys)];
}

/**
 * A saved layout as this version can show it: unreadable JSON falls back to
 * the default, the workspace never contains itself, each page appears once,
 * panels are capped, and the pages that are gone are reported by count.
 */
export function readWorkspace(
  saved: unknown,
  pages: readonly { key: string; title: string }[],
): { layout: IJsonModel; missing: number } {
  const here = new Set(pages.map((page) => page.key));
  if (
    !saved ||
    typeof saved !== "object" ||
    !("layout" in saved) ||
    !saved.layout ||
    typeof saved.layout !== "object"
  )
    return { layout: defaultWorkspace(pages), missing: 0 };
  const seen = new Set<string>();
  let missing = 0;
  const clean = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return undefined;
    const value = node as Record<string, unknown> & { children?: unknown };
    if (value.type === "tab") {
      const key = (value.config as { key?: unknown } | undefined)?.key;
      if (typeof key !== "string" || key === WORKSPACE_PAGE) return undefined;
      if (!here.has(key)) {
        missing++;
        return undefined;
      }
      if (seen.has(key) || seen.size >= MAX_PANELS) return undefined;
      seen.add(key);
      return { ...value, id: `page:${key}`, component: "page" };
    }
    if (value.type !== "row" && value.type !== "tabset") return undefined;
    const children = Array.isArray(value.children)
      ? value.children.map(clean).filter(Boolean)
      : [];
    // An emptied group disappears instead of leaving a blank area.
    if (!children.length) return undefined;
    return { ...value, children };
  };
  const layout = clean((saved as { layout: unknown }).layout) as
    | IJsonRowNode
    | undefined;
  if (!layout || !seen.size)
    return { layout: defaultWorkspace(pages), missing };
  return {
    layout: {
      global: { tabEnableClose: true, tabEnableRename: false },
      borders: [],
      layout:
        layout.type === "row" ? layout : { type: "row", children: [layout] },
    },
    missing,
  };
}
