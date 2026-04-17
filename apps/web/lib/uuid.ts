export function uuidV4(): string {
  const c = globalThis.crypto as Crypto | undefined;
  const maybeRandomUUID = (c as unknown as { randomUUID?: () => string })?.randomUUID;
  if (typeof maybeRandomUUID === "function") return maybeRandomUUID.call(c);

  // `crypto.randomUUID()` is only available in secure contexts (https/localhost) and newer browsers.
  // Fallback: RFC4122 v4 using getRandomValues.
  const getRandomValues = (c as unknown as { getRandomValues?: (arr: Uint8Array) => Uint8Array })?.getRandomValues;
  if (typeof getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    getRandomValues.call(c, bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last-resort fallback: not cryptographically strong, but good enough for React keys.
  return `uuid-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

