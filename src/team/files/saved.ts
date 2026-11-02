import { invoke } from "@tauri-apps/api/core";

/** The host owns every path here; a page only names the attachment. */
export const downloadFolder = (choose = false) =>
  invoke<string | null>("team_download_folder", { choose });

/** Resolves true when an already saved copy was reused. */
export const saveToFolder = (source: string, name: string, ask = false) =>
  invoke<boolean>("team_media_save", { source, name, ask });

export const savedSources = (sources: readonly string[]) =>
  invoke<string[]>("team_media_saved", { sources });

export const showSaved = (source: string, open: boolean) =>
  invoke<void>("team_media_show", { source, open });
