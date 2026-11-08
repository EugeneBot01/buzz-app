/** This device's chat display choices (Buzz Team), shared by the settings
 * card and the shell parts that follow them. */
import { type DisplaySettings, decodeDisplay, displayStyle } from "./settings";

const KEY = "buzz-team-display.v1";
const listeners = new Set<() => void>();

function read() {
  try {
    return decodeDisplay(window.localStorage.getItem(KEY));
  } catch {
    return decodeDisplay(null);
  }
}

let current: DisplaySettings | undefined;
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
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Without storage, the choice lasts until the app closes.
    }
    notify();
  },
};

const NONE: readonly string[] = Object.freeze([]);
