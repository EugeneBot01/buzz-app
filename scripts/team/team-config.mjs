// Team build: the Tauri config overlay that turns this app into "Buzz Team".
// A separate name and bundle id keep the official Buzz from replacing it, and
// the updater reads the team's own feed.
// Usage: node scripts/team/team-config.mjs <version> <out.json>
import fs from "node:fs";

const [version, out] = process.argv.slice(2);
const { BUZZ_UPDATER_PUBLIC_KEY: pubkey, BUZZ_UPDATER_ENDPOINT: endpoint } =
  process.env;
if (!/^\d+\.\d+\.\d+-team\.[1-9]\d*$/.test(version ?? ""))
  throw new Error(`Version must look like 0.0.0-team.3 (got ${version})`);
if (!pubkey || !endpoint)
  throw new Error("Set BUZZ_UPDATER_PUBLIC_KEY and BUZZ_UPDATER_ENDPOINT");
const base = JSON.parse(
  fs.readFileSync(
    new URL("../../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  ),
);
const config = {
  productName: "Buzz Team",
  identifier: "xyz.buzzteam.desktop",
  version,
  app: {
    // Arrays replace rather than merge, so keep every other window setting.
    windows: base.app.windows.map((window) => ({
      ...window,
      title: "Buzz Team",
    })),
  },
  bundle: {
    createUpdaterArtifacts: true,
    macOS: {
      ...base.bundle.macOS,
      // No Apple Developer ID: ad-hoc sign the whole bundle so macOS does not
      // call it damaged. Teammates approve it once in Privacy & Security.
      signingIdentity: "-",
    },
  },
  plugins: { updater: { pubkey, endpoints: [endpoint] } },
};
fs.writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Buzz Team ${version} → ${out}`);
