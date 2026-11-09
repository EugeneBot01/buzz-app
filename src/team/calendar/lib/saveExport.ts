import { isTauri } from "@tauri-apps/api/core";
import { downloadNativeFile } from "../../../features/messages/native-download";

/** The file kinds the calendar can export. */
export const EXPORT_KINDS = ["png", "pdf", "docx", "csv", "json"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const MIME: Record<ExportKind, string> = {
  png: "image/png",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  json: "application/json",
};

/**
 * Team build: saves to Downloads the way the app saves other files it makes
 * (the old app asked where with a native dialog). Resolves true once saved.
 */
export async function saveExportFile(
  bytes: Uint8Array,
  filename: string,
  kind: ExportKind,
): Promise<boolean> {
  const file = new Blob([new Uint8Array(bytes)], { type: MIME[kind] });
  if (isTauri()) {
    // The app saves only files it names itself; ".calendar" marks these.
    await downloadNativeFile(
      file,
      filename.replace(/\.(\w+)$/, ".calendar.$1"),
    );
    return true;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // WebKit may still be reading the blob when click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
