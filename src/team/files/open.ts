/**
 * Team build: "열기" saves an attachment to a temporary folder and opens it in
 * its ArtCraft app (WordCraft, GridCraft, DeckCraft, PdfCraft) or the Mac's
 * default app. Mirrors the host's allow-list so the button only shows where
 * the host will accept it.
 */
import { invoke } from "@tauri-apps/api/core";

const OPENABLE = new Set([
  "docx",
  "doc",
  "odt",
  "rtf",
  "xlsx",
  "xls",
  "xlsm",
  "ods",
  "csv",
  "tsv",
  "pptx",
  "ppt",
  "odp",
  "pdf",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "hwp",
  "hwpx",
]);

const APPS: Record<string, string> = {
  docx: "WordCraft",
  doc: "WordCraft",
  odt: "WordCraft",
  rtf: "WordCraft",
  xlsx: "GridCraft",
  xls: "GridCraft",
  xlsm: "GridCraft",
  ods: "GridCraft",
  csv: "GridCraft",
  tsv: "GridCraft",
  pptx: "DeckCraft",
  ppt: "DeckCraft",
  odp: "DeckCraft",
  pdf: "PdfCraft",
};

const extension = (name: string) =>
  name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

export const canOpenFile = (name: string | undefined) =>
  !!name && OPENABLE.has(extension(name));

/** The ArtCraft app this file would open in, if any. */
export const artcraftAppFor = (name: string) => APPS[extension(name)];

/** Returns the app it opened in ("default" for the Mac's own choice). */
export function openNativeMedia(source: string, name: string) {
  return invoke<string>("team_media_open", { source, name });
}
