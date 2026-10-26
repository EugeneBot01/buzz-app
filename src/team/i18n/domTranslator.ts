/**
 * Display-layer UI translation (Buzz Team). The app renders English; this
 * swaps exact UI strings for their translation right after React commits, so
 * no component has to change and upstream updates rarely conflict.
 *
 * User content is never touched: message bodies, editors, inputs, code and
 * anything marked `data-no-translate` are skipped, and only strings that
 * exactly match a dictionary entry (or a `{0}` pattern) are replaced.
 */

export type TranslationTable = {
  exact: Record<string, string>;
  /** Entries whose source contains `{0}`-style placeholders. */
  patterns: ReadonlyArray<readonly [string, string]>;
};

const LOCALE_STORAGE_KEY = "buzz-ui-locale";
const TRANSLATED_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;
const SKIP_SELECTOR = [
  "[contenteditable]",
  "[data-no-translate]",
  "pre",
  "code",
  "textarea",
  "script",
  "style",
].join(",");

export function readUiLocale(): "ko" | "en" {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) === "en"
      ? "en"
      : "ko";
  } catch {
    return "ko";
  }
}

export function writeUiLocale(locale: "ko" | "en") {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Best effort.
  }
}

type CompiledPattern = {
  regex: RegExp;
  template: string;
  /**
   * The source has at most one literal word (`Edit {0}`, `{0} only`). Such a
   * pattern also matches ordinary user text ("Edit the doc" as a channel name
   * or a preview line), so it only applies when every captured value is a
   * single token, unless the caller knows the string is UI (see `translate`).
   */
  generic: boolean;
};

const literalWords = (source: string) =>
  source
    .replace(/\{\d+\}/g, " ")
    .replace(/[^A-Za-z ]/g, " ")
    .split(" ")
    .filter(Boolean).length;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePatterns(
  patterns: TranslationTable["patterns"],
): CompiledPattern[] {
  return (
    patterns
      .map(([source, template]) => {
        const parts = source.split(/\{(\d+)\}/);
        let body = "";
        const order: number[] = [];
        parts.forEach((part, index) => {
          if (index % 2 === 0) body += escapeRegex(part);
          else {
            body += "(.+?)";
            order.push(Number(part));
          }
        });
        // Map captured groups back to placeholder numbers.
        let rewritten = template;
        order.forEach((placeholder, groupIndex) => {
          rewritten = rewritten.replaceAll(
            `{${placeholder}}`,
            `$${groupIndex + 1}`,
          );
        });
        return {
          regex: new RegExp(`^${body}$`, "s"),
          template: rewritten,
          generic: literalWords(source) <= 1,
        };
      })
      // Longer literal sources first so specific patterns win.
      .sort((a, b) => b.regex.source.length - a.regex.source.length)
  );
}

export function createTranslator(table: TranslationTable) {
  const exact = new Map(Object.entries(table.exact));
  const patterns = compilePatterns(table.patterns);

  /**
   * `ui: true` when the string is known to be app copy rather than user
   * content (a JSX sentence split across text nodes, an `aria-label`), which
   * lets one-word patterns capture multi-word values.
   */
  return function translate(
    value: string,
    options?: { ui?: boolean },
  ): string | null {
    const trimmed = value.trim();
    if (trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) return null;
    const normalized = trimmed.replace(/\s+/g, " ");
    let hit = exact.get(normalized) ?? null;
    if (hit === null) {
      for (const { regex, template, generic } of patterns) {
        const match = regex.exec(normalized);
        if (!match) continue;
        if (
          generic &&
          !options?.ui &&
          match.slice(1).some((captured) => /\s/.test(captured))
        )
          continue;
        hit = normalized.replace(regex, template);
        break;
      }
    }
    if (hit === null) return null;
    // Preserve surrounding whitespace so inline layout does not shift.
    const lead = value.match(/^\s*/)?.[0] ?? "";
    const trail = value.match(/\s*$/)?.[0] ?? "";
    return `${lead}${hit}${trail}`;
  };
}

export function startDomTranslator(
  table: TranslationTable,
  root: HTMLElement = document.body,
): () => void {
  const translate = createTranslator(table);
  const originalText = new WeakMap<Text, string>();
  const translatedText = new WeakMap<Text, string>();
  const originalAttrs = new WeakMap<Element, Map<string, string>>();

  const isSkipped = (element: Element | null) =>
    !element || element.closest(SKIP_SELECTOR) !== null;

  // English value of a node, even after we overwrote it.
  const sourceOf = (node: Text) => {
    const current = node.nodeValue ?? "";
    const written = translatedText.get(node);
    return written !== undefined && current === written
      ? (originalText.get(node) ?? current)
      : current;
  };

  const write = (node: Text, source: string, next: string) => {
    originalText.set(node, source);
    translatedText.set(node, next);
    if (node.nodeValue !== next) node.nodeValue = next;
  };

  const translateSingle = (node: Text) => {
    const source = sourceOf(node);
    const next = translate(source);
    if (next !== null) write(node, source, next);
    else if (translatedText.has(node) && node.nodeValue !== source)
      write(node, source, source);
  };

  // JSX like `Saves kind {n} events…` renders as adjacent text nodes in one
  // element. Translate the joined sentence so Korean word order works, then
  // put it all in the first node and blank the rest.
  const isSentenceParent = (parent: Element) =>
    parent.childNodes.length > 1 &&
    Array.from(parent.childNodes).every(
      (child) => child.nodeType === Node.TEXT_NODE,
    );

  const translateSentence = (parent: Element) => {
    const nodes = Array.from(parent.childNodes) as Text[];
    const sources = nodes.map(sourceOf);
    // Adjacent text nodes are a JSX template (`Edit {name}`), never user text.
    const whole = translate(sources.join(""), { ui: true });
    if (whole === null) {
      nodes.forEach(translateSingle);
      return;
    }
    nodes.forEach((node, index) => {
      write(node, sources[index] ?? "", index === 0 ? whole : "");
    });
  };

  const translateText = (node: Text) => {
    const parent = node.parentElement;
    if (isSkipped(parent)) return;
    if (parent && isSentenceParent(parent)) {
      translateSentence(parent);
      return;
    }
    // Our own write echoing back through the observer.
    if (translatedText.get(node) === (node.nodeValue ?? "")) return;
    translateSingle(node);
  };

  const translateAttrs = (element: Element) => {
    if (isSkipped(element)) return;
    for (const name of TRANSLATED_ATTRIBUTES) {
      const current = element.getAttribute(name);
      if (!current) continue;
      const saved = originalAttrs.get(element);
      if (saved?.get(`${name}:out`) === current) continue;
      // A `title` tooltip can be user text (a channel or file name), and a
      // visible `placeholder` not in the dictionary would come out garbled
      // ("Search or create a channel" → "or create a channel 검색").
      const next = translate(current, { ui: name === "aria-label" });
      if (next === null || next === current) continue;
      const map = saved ?? new Map<string, string>();
      map.set(name, current);
      map.set(`${name}:out`, next);
      originalAttrs.set(element, map);
      element.setAttribute(name, next);
    }
  };

  const translateTree = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      translateText(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (isSkipped(element)) return;
    translateAttrs(element);
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (candidate) =>
          candidate.nodeType === Node.ELEMENT_NODE &&
          (candidate as Element).matches(SKIP_SELECTOR)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      },
    );
    for (
      let current = walker.nextNode();
      current;
      current = walker.nextNode()
    ) {
      if (current.nodeType === Node.TEXT_NODE) translateText(current as Text);
      else translateAttrs(current as Element);
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateText(mutation.target as Text);
      } else if (mutation.type === "attributes") {
        translateAttrs(mutation.target as Element);
      } else {
        mutation.addedNodes.forEach(translateTree);
      }
    }
  });

  translateTree(root);
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATED_ATTRIBUTES],
  });

  return () => observer.disconnect();
}
