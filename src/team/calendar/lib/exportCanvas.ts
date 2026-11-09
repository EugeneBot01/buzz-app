import type { BoardPage } from "./exportModel";
import { PAPER_COLORS, PHASE_FILLS, buildPdf } from "./exportFormats";

/**
 * Draws board pages on a canvas (team patch) for PNG and PDF exports. Always
 * the light "paper" look, whatever the app theme, so a printout is readable.
 */

const FONT_FAMILY =
  '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';
const INK = "#15191e";
const MUTED = "#5d6672";
const LINE = "#d5d9de";
const STRONG_LINE = "#9aa3ad";
const ACCENT = "#d4380d";
const TAPE = "#ffd84a";

/** WebKit refuses canvases over about 16.7 million pixels. */
const MAX_CANVAS_PIXELS = 16_000_000;

type Layout = {
  width: number;
  height: number;
  labelWidth: number;
  columnWidth: number;
  headerHeight: number;
  bandHeight: number;
  columnHeaderHeight: number;
  rowHeights: number[];
  cellLines: string[][][][]; // row -> column -> item -> lines
};

const PAD = 24;
const ITEM_FONT = 12.5;
const LINE_HEIGHT = 17;

function font(size: number, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

/** Splits `text` into lines no wider than `width` (Korean breaks anywhere). */
export function wrapText(
  measure: (value: string) => number,
  text: string,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  let lastSpace = -1;
  for (const char of text) {
    const next = line + char;
    if (measure(next) <= width || line.length === 0) {
      line = next;
      if (char === " ") lastSpace = line.length - 1;
      continue;
    }
    if (lastSpace > 0 && char !== " ") {
      lines.push(line.slice(0, lastSpace));
      line = line.slice(lastSpace + 1) + char;
    } else {
      lines.push(line.trimEnd());
      line = char === " " ? "" : char;
    }
    lastSpace = -1;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [""];
}

function layoutPage(ctx: CanvasRenderingContext2D, page: BoardPage): Layout {
  const isMonth = !page.rowLabels;
  const labelWidth = page.rowLabels ? 112 : 0;
  const columnWidth = isMonth ? 150 : 176;
  const width = PAD * 2 + labelWidth + columnWidth * page.columns.length;
  const headerHeight = 64 + (page.note ? 36 : 0);
  const bandHeight = page.bands?.some((band) => band.label) ? 24 : 0;
  const columnHeaderHeight = isMonth ? 26 : 34;
  ctx.font = font(ITEM_FONT);
  const measure = (value: string) => ctx.measureText(value).width;
  const textWidth = columnWidth - 18 - 14;
  const cellLines = page.rows.map((row) =>
    row.cells.map((cell) =>
      cell.items.map((item) => wrapText(measure, item.text, textWidth)),
    ),
  );
  const rowHeights = cellLines.map((row) => {
    const tallest = Math.max(
      0,
      ...row.map(
        (items) =>
          items.reduce(
            (sum, lines) => sum + lines.length * LINE_HEIGHT + 3,
            0,
          ) + (isMonth ? 24 : 14),
      ),
    );
    return Math.max(isMonth ? 104 : 46, tallest);
  });
  const height =
    PAD * 2 +
    headerHeight +
    bandHeight +
    columnHeaderHeight +
    rowHeights.reduce((sum, value) => sum + value, 0);
  return {
    width,
    height,
    labelWidth,
    columnWidth,
    headerHeight,
    bandHeight,
    columnHeaderHeight,
    rowHeights,
    cellLines,
  };
}

function drawPage(
  ctx: CanvasRenderingContext2D,
  page: BoardPage,
  layout: Layout,
  top: number,
) {
  const left = PAD;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, top, layout.width, layout.height);
  ctx.textBaseline = "top";

  // Title, subtitle and counters.
  ctx.fillStyle = INK;
  ctx.font = font(22, 700);
  ctx.fillText(page.title, left, top + PAD);
  if (page.subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = font(12.5);
    ctx.fillText(page.subtitle, left, top + PAD + 32);
  }
  let counterRight = layout.width - PAD;
  for (const counter of [...(page.counters ?? [])].reverse()) {
    ctx.font = font(11.5);
    const labelWidth = ctx.measureText(counter.label).width;
    ctx.font = font(20, 600);
    const valueWidth = ctx.measureText(counter.value).width;
    const boxWidth = Math.max(labelWidth, valueWidth) + 24;
    const x = counterRight - boxWidth;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + PAD + 0.5, boxWidth, 50);
    ctx.fillStyle = counter.hot ? ACCENT : INK;
    ctx.fillText(counter.value, x + 12, top + PAD + 6);
    ctx.fillStyle = MUTED;
    ctx.font = font(11.5);
    ctx.fillText(counter.label, x + 12, top + PAD + 32);
    counterRight = x - 8;
  }
  let y = top + PAD + 64;
  if (page.note) {
    ctx.fillStyle = "#f5f6f8";
    ctx.fillRect(left, y, layout.width - PAD * 2, 26);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(left, y, 4, 26);
    ctx.fillStyle = INK;
    ctx.font = font(12.5);
    ctx.fillText(page.note, left + 12, y + 6);
    y += 36;
  }

  const gridLeft = left + layout.labelWidth;
  const gridWidth = layout.columnWidth * page.columns.length;

  // Phase bands.
  if (layout.bandHeight) {
    if (page.rowLabels) {
      ctx.fillStyle = `#${PHASE_FILLS.none}`;
      ctx.fillRect(left, y, layout.labelWidth, layout.bandHeight);
      ctx.fillStyle = MUTED;
      ctx.font = font(10.5, 600);
      ctx.fillText("PHASE", left + 8, y + 7);
    }
    let x = gridLeft;
    for (const band of page.bands ?? []) {
      const bandWidth = band.span * layout.columnWidth;
      ctx.fillStyle = `#${PHASE_FILLS[band.tone]}`;
      ctx.fillRect(x, y, bandWidth, layout.bandHeight);
      ctx.fillStyle = band.tone === "prod" ? ACCENT : INK;
      ctx.font = font(10.5, 600);
      ctx.fillText(band.label, x + 8, y + 7, bandWidth - 12);
      x += bandWidth;
    }
    y += layout.bandHeight;
  }

  // Column headers.
  if (page.rowLabels) {
    ctx.fillStyle = `#${PHASE_FILLS.none}`;
    ctx.fillRect(left, y, layout.labelWidth, layout.columnHeaderHeight);
    ctx.fillStyle = MUTED;
    ctx.font = font(10.5, 600);
    ctx.fillText("SPRINT", left + 8, y + 11);
  }
  page.columns.forEach((column, index) => {
    const x = gridLeft + index * layout.columnWidth;
    ctx.fillStyle = column.highlight ? TAPE : `#${PHASE_FILLS.none}`;
    ctx.fillRect(x, y, layout.columnWidth, layout.columnHeaderHeight);
    ctx.fillStyle = INK;
    ctx.font = font(13, 600);
    if (page.rowLabels) {
      ctx.fillText(column.label, x + 8, y + 10);
      const labelWidth = ctx.measureText(column.label).width;
      ctx.fillStyle = column.highlight ? "#3d3000" : MUTED;
      ctx.font = font(11);
      if (column.sub) ctx.fillText(column.sub, x + 14 + labelWidth, y + 11);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(column.label, x + layout.columnWidth / 2, y + 6);
      ctx.textAlign = "left";
    }
  });
  y += layout.columnHeaderHeight;

  // Rows.
  page.rows.forEach((row, rowIndex) => {
    const rowHeight = layout.rowHeights[rowIndex] ?? 46;
    if (page.rowLabels) {
      ctx.fillStyle = "#f5f6f8";
      ctx.fillRect(left, y, layout.labelWidth, rowHeight);
      ctx.fillStyle = MUTED;
      ctx.font = font(10.5, 600);
      ctx.fillText(row.label, left + 8, y + 8, layout.labelWidth - 12);
      if (row.sub) {
        ctx.fillStyle = INK;
        ctx.font = font(13, 600);
        ctx.fillText(row.sub, left + 8, y + 24, layout.labelWidth - 12);
      }
    }
    row.cells.forEach((cell, columnIndex) => {
      const x = gridLeft + columnIndex * layout.columnWidth;
      const column = page.columns[columnIndex];
      if (cell.today) ctx.fillStyle = "#fff4cc";
      else if (column?.highlight) ctx.fillStyle = "#fff8dc";
      else if (cell.accent) ctx.fillStyle = "#fff1ea";
      else ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, layout.columnWidth, rowHeight);
      let lineY = y + 8;
      if (cell.day) {
        ctx.font = font(12.5, cell.today ? 700 : 500);
        ctx.fillStyle = cell.muted ? "#aab0b8" : cell.today ? ACCENT : INK;
        ctx.fillText(cell.day, x + 8, lineY);
        lineY += 20;
      }
      const lines = layout.cellLines[rowIndex]?.[columnIndex] ?? [];
      cell.items.forEach((item, itemIndex) => {
        const color = `#${PAPER_COLORS[item.color ?? "default"]}`;
        ctx.font = font(ITEM_FONT, 700);
        ctx.fillStyle = item.milestone ? ACCENT : color;
        ctx.fillText(item.milestone ? "◆" : "•", x + 8, lineY);
        ctx.font = font(ITEM_FONT, item.milestone ? 600 : 400);
        ctx.fillStyle = cell.muted ? MUTED : INK;
        for (const line of lines[itemIndex] ?? []) {
          ctx.fillText(line, x + 22, lineY);
          lineY += LINE_HEIGHT;
        }
        lineY += 3;
      });
    });
    y += rowHeight;
  });

  // Grid lines.
  const gridTop =
    top +
    layout.height -
    PAD -
    layout.rowHeights.reduce((a, b) => a + b, 0) -
    layout.columnHeaderHeight -
    layout.bandHeight;
  const gridBottom = top + layout.height - PAD;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let lineY = gridTop + layout.bandHeight + layout.columnHeaderHeight;
  ctx.moveTo(left, gridTop + layout.bandHeight + 0.5);
  ctx.lineTo(gridLeft + gridWidth, gridTop + layout.bandHeight + 0.5);
  for (const rowHeight of [0, ...layout.rowHeights]) {
    lineY += rowHeight;
    ctx.moveTo(left, Math.round(lineY) + 0.5);
    ctx.lineTo(gridLeft + gridWidth, Math.round(lineY) + 0.5);
  }
  for (let index = 0; index <= page.columns.length; index++) {
    const x = Math.round(gridLeft + index * layout.columnWidth) + 0.5;
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridBottom);
  }
  ctx.moveTo(left + 0.5, gridTop);
  ctx.lineTo(left + 0.5, gridBottom);
  ctx.stroke();
  if (page.rowLabels) {
    ctx.strokeStyle = STRONG_LINE;
    ctx.beginPath();
    ctx.moveTo(gridLeft + 0.5, gridTop);
    ctx.lineTo(gridLeft + 0.5, gridBottom);
    ctx.stroke();
  }
}

function measuringContext(): CanvasRenderingContext2D {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다 (캔버스를 쓸 수 없음).");
  return ctx;
}

/** Renders pages stacked top to bottom on one canvas. */
export function renderPages(pages: BoardPage[]): HTMLCanvasElement {
  const measure = measuringContext();
  const layouts = pages.map((page) => layoutPage(measure, page));
  const width = Math.max(...layouts.map((layout) => layout.width));
  const height = layouts.reduce((sum, layout) => sum + layout.height, 0);
  const scale = Math.min(2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다 (캔버스를 쓸 수 없음).");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let top = 0;
  pages.forEach((page, index) => {
    const layout = layouts[index] as Layout;
    drawPage(ctx, page, { ...layout, width }, top);
    top += layout.height;
  });
  return canvas;
}

function canvasBytes(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지를 만들지 못했습니다."));
          return;
        }
        void blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      type,
      type === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

export async function pagesToPng(pages: BoardPage[]): Promise<Uint8Array> {
  return canvasBytes(renderPages(pages), "image/png");
}

export async function pagesToPdf(pages: BoardPage[]): Promise<Uint8Array> {
  const images = [];
  for (const page of pages) {
    const canvas = renderPages([page]);
    images.push({
      jpeg: await canvasBytes(canvas, "image/jpeg"),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return buildPdf(images);
}
