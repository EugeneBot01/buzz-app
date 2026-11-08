import { useSyncExternalStore } from "react";
import type { RegisteredPage } from "../../features/pages/service";
import type { NavigationOpenOptions } from "../../features/navigation/controller";
import {
  ContributionBoundary,
  contributionKey,
} from "../../features/conversation/ContributionBoundary";
import { NavigationItem } from "../../shared/design-system/ui/NavigationItem";
import { Tabs } from "../../shared/design-system/ui/Tabs";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { PageIcon } from "./PageIcon";
import { pagePresentation } from "./presentation";
import { orderTabs } from "../../team/display/settings";
import { displaySettings } from "../../team/display/store";

export function PageNavigation({
  pages,
  selected,
  currentPage = selected,
  onSelect,
  placement = "sidebar",
}: {
  pages: readonly RegisteredPage[];
  selected: string;
  currentPage?: string;
  onSelect(key: string, options?: Pick<NavigationOpenOptions, "focus">): void;
  placement?: "sidebar" | "topbar" | "toolbar";
}) {
  // Team: tabs the member hid (except the one in use), in the member's order.
  const hidden = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.hiddenTabs,
  );
  const order = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.tabOrder,
  );
  if (placement === "topbar") {
    const shown = orderTabs(
      pages.filter(
        (page) => page.key === selected || !hidden.includes(page.key),
      ),
      order,
    );
    return (
      <Tabs
        label="Topbar pages"
        variant="chrome"
        value={shown.some((page) => page.key === selected) ? selected : null}
        onValueChange={(key) => onSelect(key, { focus: "preserve" })}
        onReselect={(key) => {
          if (key !== currentPage) onSelect(key, { focus: "preserve" });
        }}
        items={shown.map((page) => {
          const Badge = page.badge;
          const { icon, image } = pagePresentation(page);
          return {
            value: page.key,
            label: pagePresentation(page).label,
            icon: (
              <PageIcon icon={icon} image={image} size={16} strokeWidth={2.5} />
            ),
            panelId: `shell-page-${page.key}`,
            trailing: Badge ? (
              <ContributionBoundary key={contributionKey(page)} fallback={null}>
                <Badge />
              </ContributionBoundary>
            ) : undefined,
          };
        })}
      />
    );
  }
  return pages.map((page) => {
    const { label, icon, image } = pagePresentation(page);
    const Badge = page.badge;
    const badge = Badge && (
      <ContributionBoundary key={contributionKey(page)} fallback={null}>
        <Badge />
      </ContributionBoundary>
    );
    const select = () => {
      onSelect(page.key);
      document.getElementById("main-content")?.focus({ preventScroll: true });
    };
    const pageIcon = (
      <PageIcon
        key={page.key}
        icon={icon}
        image={image}
        size={16}
        strokeWidth={2.5}
      />
    );
    return placement === "toolbar" ? (
      <span className="shell-toolbar-page" key={page.key}>
        <IconButton
          aria-label={label}
          title={label}
          variant="chrome"
          aria-current={selected === page.key ? "page" : undefined}
          onClick={select}
          icon={pageIcon}
        />
        {badge && <span className="shell-toolbar-badge">{badge}</span>}
      </span>
    ) : (
      <NavigationItem
        key={page.key}
        onClick={select}
        selected={selected === page.key}
        aria-current={
          selected === page.key && currentPage !== selected ? true : undefined
        }
        label={label}
        title={label}
        variant="row"
        trailing={badge}
        icon={
          placement === "sidebar" ? (
            <span className="shell-page-icon">{pageIcon}</span>
          ) : undefined
        }
      />
    );
  });
}
