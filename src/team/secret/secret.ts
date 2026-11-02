/**
 * Confidential messages (Buzz Team): the text is encrypted on this device with
 * a password the team shares elsewhere, so the relay and anyone without the
 * password only ever see the ciphertext.
 */
const MARK = "BUZZSECRET1";
const END = "Z";
const SALT = 16;
const IV = 12;
const ROUNDS = 600_000;

export const MIN_PASSWORD = 8;
// Hex only, so Markdown can never split a token.
export const SECRET_TOKEN = new RegExp(`${MARK}[0-9a-f]+${END}`, "g");

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function keyFrom(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ROUNDS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(text: string, password: string) {
  if (password.length < MIN_PASSWORD)
    throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요`);
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFrom(password, salt),
    new TextEncoder().encode(text),
  );
  return `${MARK}${hex(salt)}${hex(iv)}${hex(new Uint8Array(sealed))}${END}`;
}

/** Null when the password is wrong or the token was altered. */
export async function decryptSecret(token: string, password: string) {
  const body = token.slice(MARK.length, -END.length);
  if (!token.startsWith(MARK) || !token.endsWith(END) || body.length % 2)
    return null;
  const bytes = Uint8Array.from(body.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  if (bytes.length <= SALT + IV) return null;
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(SALT, SALT + IV) },
      await keyFrom(password, bytes.slice(0, SALT)),
      bytes.slice(SALT + IV),
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
