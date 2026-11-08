/**
 * Confidential threads (Buzz Team): the opening message carries a salt and the
 * encrypted opening text; every reply is encrypted with the key that the
 * thread's password derives from that salt. Keys live in memory only, until
 * the app quits.
 */
import { hex, keyFrom, MIN_PASSWORD, unhex } from "./secret";

const ROOT = "BUZZTHREAD1";
const REPLY = "BUZZSEAL1";
const END = "Z";
const SALT = 16;
const IV = 12;

// Hex only, so Markdown can never split a token.
export const THREAD_ROOT_TOKEN = new RegExp(`${ROOT}[0-9a-f]+${END}`, "g");
export const THREAD_REPLY_TOKEN = new RegExp(`${REPLY}[0-9a-f]+${END}`, "g");

type Root = Readonly<{
  salt: Uint8Array<ArrayBuffer>;
  sealed: Uint8Array<ArrayBuffer>;
}>;

const roots = new Map<string, Root>();
const keys = new Map<string, CryptoKey>();
/** Keys of threads this device just started, until their root arrives. */
const started = new Map<string, CryptoKey>();
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export function subscribeThreads(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function seal(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );
  return `${hex(iv)}${hex(new Uint8Array(body))}`;
}

async function open(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>) {
  if (bytes.length <= IV) return null;
  try {
    const body = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, IV) },
      key,
      bytes.slice(IV),
    );
    return new TextDecoder().decode(body);
  } catch {
    return null;
  }
}

function parse(token: string, mark: string) {
  const body = token.slice(mark.length, -END.length);
  if (!token.startsWith(mark) || !token.endsWith(END) || body.length % 2)
    return null;
  return unhex(body);
}

/** The opening message's token; this device stays unlocked for it. */
export async function startThread(text: string, password: string) {
  if (password.length < MIN_PASSWORD)
    throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요`);
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  const key = await keyFrom(password, salt);
  const token = `${ROOT}${hex(salt)}${await seal(key, text)}${END}`;
  started.set(token, key);
  return token;
}

/** Called for each rendered opening message, so its thread counts as sealed. */
export function registerRoot(rootId: string, token: string) {
  if (roots.has(rootId)) return;
  const bytes = parse(token, ROOT);
  if (!bytes || bytes.length <= SALT + IV) return;
  roots.set(rootId, {
    salt: bytes.slice(0, SALT),
    sealed: bytes.slice(SALT),
  });
  const key = started.get(token);
  if (key) {
    started.delete(token);
    keys.set(rootId, key);
  }
  changed();
}

/** Called with a thread's loaded opening message, before its reply box sends. */
export function noteThreadRoot(rootId: string, content: string) {
  const token = content.match(THREAD_ROOT_TOKEN)?.[0];
  if (token) registerRoot(rootId, token);
}

export const isSealedThread = (rootId: string | undefined) =>
  !!rootId && roots.has(rootId);
export const isUnlocked = (rootId: string) => keys.has(rootId);

/** The opening text, or null when the password is wrong. */
export async function unlockThread(rootId: string, password: string) {
  const root = roots.get(rootId);
  if (!root) return null;
  const key = await keyFrom(password, root.salt);
  const text = await open(key, root.sealed);
  if (text === null) return null;
  keys.set(rootId, key);
  changed();
  return text;
}

export async function openRoot(rootId: string) {
  const root = roots.get(rootId);
  const key = keys.get(rootId);
  return root && key ? open(key, root.sealed) : null;
}

export async function openReply(rootId: string, token: string) {
  const key = keys.get(rootId);
  const bytes = parse(token, REPLY);
  return key && bytes ? open(key, bytes) : null;
}

/** Why nothing may leave this thread's composer yet; checked before uploads. */
export function sealedThreadRefusal(
  rootId: string | undefined,
  withFiles: boolean,
) {
  if (!rootId || !roots.has(rootId)) return undefined;
  if (!keys.has(rootId))
    return "대외비 스레드예요. 위의 첫 메시지에서 비밀번호로 먼저 열어 주세요.";
  if (withFiles)
    return "대외비 스레드에는 잠근 파일만 올릴 수 있어요. 파일을 다시 첨부해 주세요.";
  return undefined;
}

/** A confidential file's upload name: it says which thread's key opens it. */
const LOCKED_FILE = /^locked\.([0-9a-f]{64})\.buzzlock$/;
export const lockedFileThread = (name: string | undefined) =>
  name?.match(LOCKED_FILE)?.[1];

/** Files this device encrypted, by the thread whose key sealed them. A
 * matching name is never proof: only these may upload in a confidential thread. */
const sealedFiles = new WeakMap<File, string>();
export const sealedFor = (file: File) => sealedFiles.get(file);
export const SEALED_FILE_MAX = 256 * 1024 * 1024;

/** The file as it is uploaded: its name, type and bytes encrypted together. */
export async function sealFile(rootId: string, file: File) {
  if (file.size > SEALED_FILE_MAX) throw new Error("파일이 너무 커요.");
  const key = keys.get(rootId);
  if (!key) throw new Error(sealedThreadRefusal(rootId, false));
  const header = new TextEncoder().encode(
    JSON.stringify({ name: file.name, type: file.type }),
  );
  const plain = new Uint8Array(4 + header.length + file.size);
  new DataView(plain.buffer).setUint32(0, header.length);
  plain.set(header, 4);
  plain.set(new Uint8Array(await file.arrayBuffer()), 4 + header.length);
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const sealed = new File([iv, body], `locked.${rootId}.buzzlock`, {
    type: "application/octet-stream",
  });
  sealedFiles.set(sealed, rootId);
  return sealed;
}

/** Null while the thread is locked or when the bytes were altered. */
export async function openFile(rootId: string, sealed: ArrayBuffer) {
  const key = keys.get(rootId);
  if (!key) return null;
  const bytes = new Uint8Array(sealed);
  if (bytes.length <= IV || bytes.length > SEALED_FILE_MAX + 4096) return null;
  try {
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, IV) },
        key,
        bytes.slice(IV),
      ),
    );
    const size = new DataView(plain.buffer).getUint32(0);
    const { name, type } = JSON.parse(
      new TextDecoder().decode(plain.slice(4, 4 + size)),
    ) as { name: string; type: string };
    return { name, type, bytes: plain.slice(4 + size) };
  } catch {
    return null;
  }
}

/** What the composer sends: encrypted inside confidential threads. */
export async function sealOutgoing(rootId: string | undefined, text: string) {
  if (!rootId || !roots.has(rootId)) return text;
  const refusal = sealedThreadRefusal(rootId, false);
  const key = keys.get(rootId);
  if (refusal || !key) throw new Error(refusal);
  return `🔒 대외비 (SHIBALPOINT 앱에서 열람) ${REPLY}${await seal(key, text)}${END}`;
}
