/** This device's UI EDIT choices and saved UI profiles (Buzz Team), shared by
 * the settings card and the shell parts that follow them. */
import {
  decodeProfiles,
  readProfile,
  saveProfile,
  type UiProfile,
} from "./profiles";
import { type DisplaySettings, decodeDisplay, displayStyle } from "./settings";

const KEY = "buzz-team-display.v1";
const PROFILES_KEY = "buzz-team-ui-profiles.v1";
const LAST_KEY = "buzz-team-ui-profile-last.v1";
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
let active = false;

function apply(settings: DisplaySettings) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(displayStyle(settings)))
    root.style.setProperty(name, value);
  root.dataset.teamDark = settings.dark;
}

const notify = () => {
  for (const listener of listeners) listener();
};

export const displaySettings = {
  snapshot(): DisplaySettings {
    current ??= read();
    return current;
  },
  /** Top tabs to leave out; none while the plugin is off. */
  hiddenTabs(): readonly string[] {
    return active ? displaySettings.snapshot().hiddenTabs : NONE;
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
      notify();
    };
  },
  change(next: DisplaySettings) {
    current = next;
    if (active) apply(next);
    store(KEY, JSON.stringify(next));
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
    displaySettings.change(settings);
    return skipped;
  },
  deleteProfile(name: string) {
    profiles = displaySettings.profiles().filter((item) => item.name !== name);
    store(PROFILES_KEY, JSON.stringify(profiles));
    notify();
  },
};

const NONE: readonly string[] = Object.freeze([]);
