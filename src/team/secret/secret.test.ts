import { expect, it } from "vitest";
import { decryptSecret, encryptSecret, SECRET_TOKEN } from "./secret";

it("opens only with the right password, and hides the text", async () => {
  const token = await encryptSecret("대외비 내용", "correct-horse");
  expect(token).not.toContain("대외비");
  expect(token.match(SECRET_TOKEN)).toEqual([token]);
  expect(await decryptSecret(token, "correct-horse")).toBe("대외비 내용");
  expect(await decryptSecret(token, "wrong-password")).toBeNull();
  expect(`${token}abc`.match(SECRET_TOKEN)).toEqual([token]);
}, 30_000);

it("rejects short passwords and altered tokens", async () => {
  await expect(encryptSecret("x", "short")).rejects.toThrow();
  const token = await encryptSecret("x", "correct-horse");
  const last = token.at(-2) === "0" ? "1" : "0";
  const altered = `${token.slice(0, -2)}${last}Z`;
  expect(await decryptSecret(altered, "correct-horse")).toBeNull();
  expect(await decryptSecret("BUZZSECRET1abZ", "correct-horse")).toBeNull();
}, 30_000);
