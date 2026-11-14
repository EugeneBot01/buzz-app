/** This device's UI EDIT choices and saved UI profiles (Buzz Team), shared by
 * the settings card and the shell parts that follow them. */
import {
  decodeProfiles,
  MAX_PROFILE_NAME,
  MAX_PROFILES,
  readProfile,
  renameProfile,
  saveProfile,
  shareProfile,
  type UiProfile,
} from "./profiles";
import { MAX_SHARED } from "./sharing";
import { type DisplaySettings, decodeDisplay, displayStyle } from "./settings";

const KEY = "buzz-team-display.v1";
const PROFILES_KEY = "buzz-team-ui-profiles.v1";
const LAST_KEY = "buzz-team-ui-profile-last.v1";
const WORKSPACE_KEY = "buzz-team-workspace.v1";
const listeners = new Set<() => void>();

function load(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Without storage, the choice lasts until the app closes.
  }
}

const read = () => decodeDisplay(load(KEY));

let current: DisplaySettings | undefined;
let profiles: readonly UiProfile[] | undefined;
let last: string | null | undefined;
let workspace: unknown;
let workspaceRead = false;
let active = false;

function apply(settings: DisplaySettings) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(displayStyle(settings)))
    root.style.setProperty(name, value);
  // 0% keeps the app's own dark colors untouched.
  root.dataset.teamDark = settings.dark > 0 ? "on" : "off";
  root.dataset.teamBackground = settings.background ? "on" : "off";
  showBackground(settings.background);
}

/** The chat background picture, as one rule on the conversation scroller. A
 * picture can be over a megabyte, so it is never a custom property on the
 * root, which every element would inherit and restyle with. */
function showBackground(background: string | null) {
  const id = "buzz-team-chat-background";
  let style = document.getElementById(id);
  if (!background) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.append(style);
  }
  const rule = `:root[data-team-background="on"] [data-message-scroller]{background-image:linear-gradient(var(--team-background-veil),var(--team-background-veil)),url("${background}")}`;
  if (style.textContent !== rule) style.textContent = rule;
}

const notify = () => {
  for (const listener of listeners) listener();
};

export const displaySettings = {
  snapshot(): DisplaySettings {
    current ??= read();
    return current;
  },
  /** Own messages on the right in bubbles; off while the plugin is off. */
  bubbles(): boolean {
    return active && displaySettings.snapshot().bubbles;
  },
  /** Message actions open on right-click; off while the plugin is off. */
  contextMenu(): boolean {
    return active && displaySettings.snapshot().messageMenu === "context";
  },
  /** Top tabs to leave out; none while the plugin is off. */
  hiddenTabs(): readonly string[] {
    return active ? displaySettings.snapshot().hiddenTabs : NONE;
  },
  /** The member's top tab order; none while the plugin is off. */
  tabOrder(): readonly string[] {
    return active ? displaySettings.snapshot().tabOrder : NONE;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Shows the saved choices; returns how to undo them when the plugin stops. */
  start() {
    active = true;
    apply(displaySettings.snapshot());
    notify();
    return () => {
      active = false;
      const root = document.documentElement;
      for (const name of Object.keys(displayStyle(displaySettings.snapshot())))
        root.style.removeProperty(name);
      delete root.dataset.teamDark;
      delete root.dataset.teamBackground;
      showBackground(null);
      notify();
    };
  },
  /** Shows `next` at once without saving or telling anyone, for a slider
   * mid-drag; `change` afterwards saves it. */
  preview(next: DisplaySettings) {
    current = next;
    if (active) apply(next);
  },
  change(next: DisplaySettings) {
    current = next;
    if (active) apply(next);
    store(KEY, JSON.stringify(next));
    notify();
  },
  /** The saved workspace arrangement as stored; the workspace page cleans it. */
  workspace(): unknown {
    if (!workspaceRead) {
      workspaceRead = true;
      try {
        workspace = JSON.parse(load(WORKSPACE_KEY) ?? "null");
      } catch {
        workspace = null;
      }
    }
    return workspace;
  },
  setWorkspace(next: unknown) {
    workspace = next;
    workspaceRead = true;
    store(WORKSPACE_KEY, JSON.stringify(next));
    notify();
  },
  profiles(): readonly UiProfile[] {
    profiles ??= decodeProfiles(load(PROFILES_KEY));
    return profiles;
  },
  /** The profile applied most recently, for Re-apply after an update. */
  lastProfile(): string | null {
    last ??= load(LAST_KEY);
    return last;
  },
  /** Saves the current choices under `name`; throws a message to show. */
  saveProfile(name: string) {
    profiles = saveProfile(
      displaySettings.profiles(),
      name,
      displaySettings.snapshot(),
      Date.now(),
      displaySettings.workspace() ?? undefined,
    );
    store(PROFILES_KEY, JSON.stringify(profiles));
    last = profiles[0]?.name ?? null;
    if (last) store(LAST_KEY, last);
    notify();
  },
  /** Applies a saved profile; returns what this version could not apply. */
  applyProfile(name: string, tabsHere: readonly string[]) {
    const profile = displaySettings
      .profiles()
      .find((item) => item.name === name);
    if (!profile) throw new Error("저장된 프로필을 찾지 못했어요.");
    const { settings, skipped } = readProfile(profile, tabsHere);
    last = name;
    store(LAST_KEY, name);
    if (profile.workspace !== undefined)
      // A fresh copy, so re-applying the same profile still rebuilds the panels.
      displaySettings.setWorkspace(structuredClone(profile.workspace));
    displaySettings.change({
      ...settings,
      background: displaySettings.snapshot().background,
    });
    return skipped;
  },
  /** Applies a teammate's shared look; their work area is never shared. */
  applyShared(profile: UiProfile, tabsHere: readonly string[]) {
    const { settings, skipped } = readProfile(profile, tabsHere);
    displaySettings.change({
      ...settings,
      background: displaySettings.snapshot().background,
    });
    return skipped;
  },
  /** Replaces the saved look of `name` with the current one. */
  updateProfile(name: string) {
    displaySettings.saveProfile(name);
  },
  renameProfile(from: string, to: string) {
    profiles = renameProfile(displaySettings.profiles(), from, to);
    store(PROFILES_KEY, JSON.stringify(profiles));
    if (displaySettings.lastProfile() === from) {
      last = to.trim();
      store(LAST_KEY, last);
    }
    notify();
  },
  shareProfile(name: string, community: string, shared: boolean) {
    profiles = shareProfile(
      displaySettings.profiles(),
      name,
      community,
      shared,
      MAX_SHARED,
    );
    store(PROFILES_KEY, JSON.stringify(profiles));
    notify();
  },
  /** The profiles this member shares in one community, as published. */
  sharedProfiles(community: string): UiProfile[] {
    return displaySettings
      .profiles()
      .filter((profile) => profile.sharedIn?.includes(community));
  },
  /** Copies a teammate's profile into this member's own, under a free name. */
  copyProfile(profile: UiProfile, from: string) {
    const taken = new Set(displaySettings.profiles().map((item) => item.name));
    if (taken.size >= MAX_PROFILES)
      throw new Error(`프로필은 ${MAX_PROFILES}개까지 저장할 수 있어요.`);
    // The suffix always fits, so each try is a different name.
    const named = (n: number) => {
      const suffix = ` (${from.slice(0, 12)}${n > 1 ? ` ${n}` : ""})`;
      return `${profile.name.slice(0, MAX_PROFILE_NAME - suffix.length)}${suffix}`;
    };
    let n = 1;
    while (taken.has(named(n)) && n <= MAX_PROFILES + 1) n++;
    const name = named(n);
    profiles = [
      { name, settings: profile.settings, savedAt: Date.now() },
      ...displaySettings.profiles(),
    ];
    store(PROFILES_KEY, JSON.stringify(profiles));
    notify();
    return name;
  },
  deleteProfile(name: string) {
    profiles = displaySettings.profiles().filter((item) => item.name !== name);
    store(PROFILES_KEY, JSON.stringify(profiles));
    notify();
  },
};

const NONE: readonly string[] = Object.freeze([]);
