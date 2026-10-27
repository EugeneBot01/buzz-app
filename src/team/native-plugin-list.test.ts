// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { bundledPlugins } from "../bundled";

/**
 * The desktop app keeps its own copy of the bundled plugin list in Rust
 * (`bundled_manifests` and `enabled_by_default`). A plugin missing there works
 * in the browser but never appears in the real app, so the two must match.
 */
const rust = readFileSync(
  join(process.cwd(), "crates/plugin-manager/src/lib.rs"),
  "utf8",
);
const folders = readdirSync(join(process.cwd(), "src/bundled"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const start = rust.indexOf("fn enabled_by_default");
const defaultOn = rust.slice(start, rust.indexOf("\n}\n", start));

it("lists every bundled plugin's manifest in the native catalog", () => {
  const listed = new Set(
    [...rust.matchAll(/src\/bundled\/([a-z0-9-]+)\/manifest\.json/g)].map(
      (match) => match[1],
    ),
  );
  const missing = bundledPlugins
    .map(({ manifest }) => manifest.id)
    .filter((id) => {
      const folder = folders.find((name) => {
        try {
          return (
            JSON.parse(
              readFileSync(
                join(process.cwd(), "src/bundled", name, "manifest.json"),
                "utf8",
              ),
            ).id === id
          );
        } catch {
          return false;
        }
      });
      return !folder || !listed.has(folder);
    });
  expect(missing).toEqual([]);
});

it("turns on natively exactly the plugins the app turns on by default", () => {
  for (const { manifest, enabledByDefault = true } of bundledPlugins)
    expect(defaultOn.includes(`"${manifest.id}"`), manifest.id).toBe(
      enabledByDefault,
    );
});
