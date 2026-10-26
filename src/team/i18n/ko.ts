import type { TranslationTable } from "./domTranslator";
import exact from "./ko-exact.json";
import patterns from "./ko-patterns.json";

/** Korean UI dictionary. Add entries to the JSON files, not here. */
export const KO_TABLE: TranslationTable = {
  exact,
  patterns: patterns as unknown as TranslationTable["patterns"],
};
