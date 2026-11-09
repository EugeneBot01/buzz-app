import type { CalendarColor } from "./teamCalendar";
import type { BoardPage } from "./exportModel";

/**
 * File writers for calendar exports (team patch), with no dependencies:
 * a stored (uncompressed) ZIP for .docx, a Word document of tables, and a
 * PDF of one JPEG image per page. Pure functions so they can be tested.
 */

/** Hex colors of the calendar colors on paper (bar fill, text-safe). */
export const PAPER_COLORS: Record<CalendarColor | "default", string> = {
  default: "5B6B7F",
  red: "D9363E",
  orange: "E8710A",
  green: "2F9E44",
  blue: "1C7ED6",
  purple: "7048E8",
  pink: "D6336C",
  gray: "868E96",
  yellow: "E0A800",
  lime: "66A80F",
  teal: "0CA678",
  cyan: "1098AD",
  indigo: "4263EB",
  brown: "8B5A2B",
};

export const PHASE_FILLS = {
  pre: "DFE7F0",
  prod: "FFE3D6",
  post: "E2ECDF",
  other: "ECECEC",
  none: "F5F6F8",
} as const;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

/** A ZIP archive with every file stored (no compression). */
export function zipStore(files: Array<{ name: string; data: Uint8Array }>) {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 1980-01-01 00:00, the earliest DOS date: stable output for tests.
  const dosTime = 0;
  const dosDate = (0 << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = utf8(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, file.data.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return concat([...chunks, ...central, new Uint8Array(end.buffer)]);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Text safe inside XML (and without characters XML 1.0 forbids). */
export function xmlText(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

const FONT =
  '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic" w:cs="Malgun Gothic"/>';

function run(
  value: string,
  options: {
    bold?: boolean | undefined;
    size?: number | undefined;
    color?: string | undefined;
  } = {},
) {
  const props = [
    FONT,
    options.bold ? "<w:b/>" : "",
    options.color ? `<w:color w:val="${options.color}"/>` : "",
    `<w:sz w:val="${options.size ?? 16}"/><w:szCs w:val="${options.size ?? 16}"/>`,
  ].join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlText(value)}</w:t></w:r>`;
}

function paragraph(
  runs: string,
  options: {
    align?: "center" | undefined;
    after?: number | undefined;
    keepNext?: boolean | undefined;
    pageBreakBefore?: boolean | undefined;
  } = {},
) {
  const props = [
    options.keepNext ? "<w:keepNext/>" : "",
    options.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    `<w:spacing w:before="0" w:after="${options.after ?? 0}" w:line="240" w:lineRule="auto"/>`,
    options.align ? `<w:jc w:val="${options.align}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

function cell(
  content: string,
  options: {
    width: number;
    fill?: string | undefined;
    span?: number | undefined;
  } = { width: 1000 },
) {
  const props = [
    `<w:tcW w:w="${options.width}" w:type="dxa"/>`,
    options.span && options.span > 1
      ? `<w:gridSpan w:val="${options.span}"/>`
      : "",
    options.fill
      ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>`
      : "",
    '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar>',
  ].join("");
  return `<w:tc><w:tcPr>${props}</w:tcPr>${content || paragraph("")}</w:tc>`;
}

/** Usable width of an A4 landscape page with 1.27 cm margins, in twips. */
const PAGE_WIDTH = 16838 - 2 * 720;

function pageTable(page: BoardPage): string {
  const labelWidth = page.rowLabels ? 1300 : 0;
  const columnWidth = Math.floor(
    (PAGE_WIDTH - labelWidth) / Math.max(1, page.columns.length),
  );
  const grid = [
    ...(page.rowLabels ? [labelWidth] : []),
    ...page.columns.map(() => columnWidth),
  ]
    .map((width) => `<w:gridCol w:w="${width}"/>`)
    .join("");
  const rows: string[] = [];
  const header = (cells: string) =>
    `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${cells}</w:tr>`;
  if (page.bands?.some((band) => band.label)) {
    rows.push(
      header(
        (page.rowLabels
          ? cell(paragraph(run("PHASE", { bold: true, size: 14 })), {
              width: labelWidth,
              fill: PHASE_FILLS.none,
            })
          : "") +
          page.bands
            .map((band) =>
              cell(
                paragraph(
                  run(band.label, {
                    bold: true,
                    size: 14,
                    color: band.tone === "prod" ? "D4380D" : undefined,
                  }),
                ),
                {
                  width: columnWidth * band.span,
                  span: band.span,
                  fill: PHASE_FILLS[band.tone],
                },
              ),
            )
            .join(""),
      ),
    );
  }
  rows.push(
    header(
      (page.rowLabels
        ? cell(
            paragraph(
              run(page.bands ? "SPRINT" : "", { bold: true, size: 14 }),
            ),
            {
              width: labelWidth,
              fill: PHASE_FILLS.none,
            },
          )
        : "") +
        page.columns
          .map((column) =>
            cell(
              paragraph(
                run(column.label, { bold: true, size: 16 }) +
                  (column.sub
                    ? run(` ${column.sub}`, { size: 14, color: "5D6672" })
                    : ""),
                { align: page.rowLabels ? undefined : "center" },
              ),
              {
                width: columnWidth,
                fill: column.highlight ? "FFD84A" : PHASE_FILLS.none,
              },
            ),
          )
          .join(""),
    ),
  );
  for (const row of page.rows) {
    const cells = row.cells
      .map((boardCell) => {
        const parts: string[] = [];
        if (boardCell.day)
          parts.push(
            paragraph(
              run(boardCell.day, {
                bold: boardCell.today,
                size: 16,
                color: boardCell.muted
                  ? "AAB0B8"
                  : boardCell.today
                    ? "D4380D"
                    : undefined,
              }),
            ),
          );
        for (const item of boardCell.items) {
          const color = PAPER_COLORS[item.color ?? "default"];
          parts.push(
            paragraph(
              run(item.milestone ? "◆ " : "• ", {
                bold: true,
                size: 14,
                color: item.milestone ? "D4380D" : color,
              }) + run(item.text, { bold: item.milestone, size: 15 }),
            ),
          );
        }
        return cell(parts.join(""), {
          width: columnWidth,
          fill: boardCell.today
            ? "FFF4CC"
            : boardCell.accent
              ? "FFF1EA"
              : undefined,
        });
      })
      .join("");
    const label = page.rowLabels
      ? cell(
          paragraph(run(row.label, { bold: true, size: 13, color: "5D6672" })) +
            (row.sub ? paragraph(run(row.sub, { bold: true, size: 16 })) : ""),
          { width: labelWidth, fill: "F5F6F8" },
        )
      : "";
    rows.push(
      `<w:tr><w:trPr><w:cantSplit/>${
        page.rowLabels ? "" : '<w:trHeight w:val="1300"/>'
      }</w:trPr>${label}${cells}</w:tr>`,
    );
  }
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9CED6"/>`;
  return [
    "<w:tbl><w:tblPr>",
    '<w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>',
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>`,
    `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>`,
    rows.join(""),
    "</w:tbl>",
  ].join("");
}

/** A Word document (.docx) with one landscape page (table) per board page. */
export function buildDocx(pages: BoardPage[]): Uint8Array {
  const body = pages
    .map((page, index) => {
      const parts = [
        paragraph(run(page.title, { bold: true, size: 28 }), {
          after: 40,
          keepNext: true,
          pageBreakBefore: index > 0,
        }),
      ];
      const meta = [
        page.subtitle,
        ...(page.counters ?? []).map(
          (counter) => `${counter.value} ${counter.label}`,
        ),
      ].filter(Boolean);
      if (meta.length)
        parts.push(
          paragraph(run(meta.join("  ·  "), { size: 16, color: "5D6672" }), {
            after: 60,
            keepNext: true,
          }),
        );
      if (page.note)
        parts.push(
          paragraph(run(page.note, { size: 16 }), {
            after: 80,
            keepNext: true,
          }),
        );
      parts.push(pageTable(page));
      return parts.join("");
    })
    .join("");
  const document = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<w:body>",
    body,
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>',
    '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>',
    "</w:sectPr></w:body></w:document>",
  ].join("");
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    "</Types>",
  ].join("");
  const rels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    "</Relationships>",
  ].join("");
  return zipStore([
    { name: "[Content_Types].xml", data: utf8(contentTypes) },
    { name: "_rels/.rels", data: utf8(rels) },
    { name: "word/document.xml", data: utf8(document) },
  ]);
}

export type PdfImagePage = { jpeg: Uint8Array; width: number; height: number };

/** A4 landscape in points. */
const PDF_PAGE = { width: 842, height: 595, margin: 24 };

/**
 * A PDF with one A4 landscape page per JPEG image, each scaled to fit the
 * page (aspect ratio kept) and centered.
 */
export function buildPdf(pages: PdfImagePage[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? utf8(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: Array<Uint8Array | string>) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const piece of body) push(piece);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n%âãÏÓ\n");
  // 1 catalog, 2 pages, then 3 objects per page: page, content, image.
  const pageIds = pages.map((_, index) => 3 + index * 3);
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  ]);
  pages.forEach((page, index) => {
    const pageId = pageIds[index] as number;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const room = {
      width: PDF_PAGE.width - 2 * PDF_PAGE.margin,
      height: PDF_PAGE.height - 2 * PDF_PAGE.margin,
    };
    const scale = Math.min(room.width / page.width, room.height / page.height);
    const width = page.width * scale;
    const height = page.height * scale;
    const x = (PDF_PAGE.width - width) / 2;
    const y = (PDF_PAGE.height - height) / 2;
    const content = `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    object(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE.width} ${PDF_PAGE.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    object(contentId, [
      `<< /Length ${utf8(content).length} >>\nstream\n${content}\nendstream`,
    ]);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      "\nendstream",
    ]);
  });
  const count = 3 + pages.length * 3;
  const xrefAt = length;
  const lines = ["xref", `0 ${count}`, "0000000000 65535 f "];
  for (let id = 1; id < count; id++)
    lines.push(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n `);
  push(`${lines.join("\n")}\n`);
  push(
    `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );
  return concat(parts);
}

/** Safe file name part: no path separators or characters macOS dislikes. */
export function fileSafe(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "calendar"
  );
}
