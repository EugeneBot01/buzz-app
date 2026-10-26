import { readUiLocale, startDomTranslator } from "./domTranslator";

/** Starts the Korean UI translator unless the viewer chose English. */
export function startTeamTranslation() {
  if (readUiLocale() !== "ko") return;
  document.documentElement.lang = "ko";
  // Loaded lazily so the English path stays untouched.
  void import("./ko").then(({ KO_TABLE }) => startDomTranslator(KO_TABLE));
}

/** True once the Korean UI started in this window (text outside the page, such
 * as OS notification banners, is written in Korean directly). */
export function koreanUiActive() {
  return (
    typeof document !== "undefined" && document.documentElement.lang === "ko"
  );
}
