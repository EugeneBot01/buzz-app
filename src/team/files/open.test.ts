import { expect, it } from "vitest";
import { artcraftAppFor, canOpenFile } from "./open";

it("offers Open only for documents and pictures", () => {
  expect(canOpenFile("기획서.DOCX")).toBe(true);
  expect(canOpenFile("photo.png")).toBe(true);
  expect(canOpenFile("installer.dmg")).toBe(false);
  expect(canOpenFile("script.sh")).toBe(false);
  expect(canOpenFile("no-extension")).toBe(false);
  expect(canOpenFile(undefined)).toBe(false);
});

it("picks the ArtCraft app by type", () => {
  expect(artcraftAppFor("a.xlsx")).toBe("GridCraft");
  expect(artcraftAppFor("a.pptx")).toBe("DeckCraft");
  expect(artcraftAppFor("a.pdf")).toBe("PdfCraft");
  expect(artcraftAppFor("a.png")).toBeUndefined();
});
