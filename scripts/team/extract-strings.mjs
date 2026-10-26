// Team build: lists user-visible English strings in src/ (JSX text, visible
// props, UI-shaped literals). Needs the TypeScript 5 JS API; TypeScript 7 has
// none, so pass its path: TS_MODULE=/path/to/typescript node ... <out.json>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)(
  process.env.TS_MODULE ?? "typescript",
);
const root = path.resolve(process.argv[3] ?? ".");
const out = new Map();
const PROPS = new Set([
  "placeholder",
  "title",
  "aria-label",
  "label",
  "description",
  "alt",
  "tooltip",
  "heading",
  "subtitle",
  "emptyText",
  "confirmLabel",
  "cancelLabel",
  "text",
  "message",
  "hint",
  "summary",
  "name",
]);
const OBJECT_KEYS =
  /^(label|title|name|description|placeholder|tooltip|heading|subtitle|text|message|hint|summary|ariaLabel|shortLabel|emptyTitle|emptyDescription)$/;

function add(raw, file) {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s || !/[A-Za-z]/.test(s) || s.length < 2) return;
  if (/^[a-z0-9_.\-/:@#]+$/.test(s)) return;
  if (/^(https?:|\.\/|@\/|[a-z]+\.[a-z]+\.)/.test(s)) return;
  if (!out.has(s)) out.set(s, file);
}

function visitFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const rel = path.relative(root, file);
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node.text, rel);
    else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      if (PROPS.has(name) || /Label$|Text$|Title$/.test(name)) {
        const value = node.initializer;
        if (ts.isStringLiteral(value)) add(value.text, rel);
        else if (
          ts.isJsxExpression(value) &&
          value.expression &&
          (ts.isStringLiteral(value.expression) ||
            ts.isNoSubstitutionTemplateLiteral(value.expression))
        )
          add(value.expression.text, rel);
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteral(node.initializer) &&
      OBJECT_KEYS.test(node.name.getText()) &&
      /^[A-Z][A-Za-z' ,.&-]{1,60}$/.test(node.initializer.text)
    )
      add(node.initializer.text, rel);
    else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text.includes(" ") &&
      /^[A-Z]/.test(node.text) &&
      !ts.isImportDeclaration(node.parent)
    ) {
      const parent = node.parent;
      if (
        !(
          ts.isCallExpression(parent) &&
          /test|describe|it|expect|log|warn|error|debug/.test(
            parent.expression.getText(),
          )
        )
      )
        add(node.text, rel);
    } else if (ts.isTemplateExpression(node) && /^[A-Z]/.test(node.head.text)) {
      let template = node.head.text;
      node.templateSpans.forEach((span, index) => {
        template += `{${index}}${span.literal.text}`;
      });
      add(template, rel);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        !/node_modules|__tests__|design-system\/icons|src\/team\/i18n/.test(
          file,
        )
      )
        walk(file);
    } else if (
      /\.(tsx|ts)$/.test(entry.name) &&
      !/\.(test|spec|stories|d)\.tsx?$/.test(entry.name)
    )
      visitFile(file);
  }
}

walk(path.join(root, "src"));
fs.writeFileSync(
  process.argv[2],
  JSON.stringify(Object.fromEntries(out), null, 1),
);
console.log(`${out.size} strings`);
