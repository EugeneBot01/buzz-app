import { readUiLocale, startDomTranslator } from "./domTranslator";

/** Starts the Korean UI translator unless the viewer chose English. */
export function startTeamTranslation() {
  if (readUiLocale() !== "ko") return;
  document.documentElement.lang = "ko";
  // Loaded lazily so the English path stays untouched.
  void import("./ko").then(({ KO_TABLE }) => startDomTranslator(KO_TABLE));
}
