/** Matrix encrypted attachments (AES-CTR-256 + SHA-256), per the client-server spec. */

export interface EncryptedFile {
  url: string;
  key: JsonWebKey;
  iv: string;
  hashes: { sha256: string };
  v: "v2";
  mimetype?: string;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "");
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "===".slice((std.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptAttachment(plain: ArrayBuffer): Promise<{ data: ArrayBuffer; file: Omit<EncryptedFile, "url"> }> {
  const key = await crypto.subtle.generateKey({ name: "AES-CTR", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv.subarray(0, 8)); // high 64 bits random, counter starts at 0
  const data = await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, key, plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return {
    data,
    file: {
      key: { kty: "oct", alg: "A256CTR", ext: true, k: jwk.k, key_ops: ["encrypt", "decrypt"] },
      iv: b64(iv),
      hashes: { sha256: b64(hash) },
      v: "v2",
    },
  };
}

export async function decryptAttachment(data: ArrayBuffer, file: EncryptedFile): Promise<ArrayBuffer> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  if (b64(hash) !== file.hashes.sha256.replace(/=+$/, "")) throw new Error("attachment hash mismatch");
  const key = await crypto.subtle.importKey("jwk", { ...file.key, key_ops: ["encrypt", "decrypt"] }, { name: "AES-CTR" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-CTR", counter: unb64(file.iv), length: 64 }, key, data);
}
