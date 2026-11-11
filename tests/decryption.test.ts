import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  bytesToBase64,
  decrypt,
  decryptPayload,
  deriveKey,
  InvalidPasswordError,
  KEY_CHECK_PLAINTEXT,
  KEY_DERIVATION_ITERATIONS,
  KEY_DERIVATION_SALT,
  verifyKeyCheck,
} from "@/lib/encryption/decryption";

type Vectors = {
  encryption_version: number;
  password: string;
  key_derivation: { salt_utf8: string; iterations: number; key_size: number };
  key_base64: string;
  key_check: { plaintext_utf8: string; nonce_base64: string; ciphertext_base64: string };
  messages: { description: string; nonce_base64: string; ciphertext_base64: string; plaintext: string }[];
};

// Copy of interface-personal-whats/tests/vectors/v1.json
const vectors: Vectors = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "vectors", "v1.json"), "utf8"),
);

describe("encryption v1 vectors", () => {
  let key: CryptoKey;

  beforeAll(async () => {
    key = await deriveKey(vectors.password);
  });

  it("uses the parameters of the vectors", () => {
    expect(vectors.encryption_version).toBe(1);
    expect(KEY_DERIVATION_SALT).toBe(vectors.key_derivation.salt_utf8);
    expect(KEY_DERIVATION_ITERATIONS).toBe(vectors.key_derivation.iterations);
    expect(KEY_CHECK_PLAINTEXT).toBe(vectors.key_check.plaintext_utf8);
  });

  it("derives the same key", async () => {
    const extractableKey = await deriveKey(vectors.password, true);
    const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", extractableKey));
    expect(keyBytes.length).toBe(vectors.key_derivation.key_size);
    expect(bytesToBase64(keyBytes)).toBe(vectors.key_base64);
  });

  it("derives a non-extractable key by default", () => {
    expect(key.extractable).toBe(false);
  });

  it("verifies the key check", async () => {
    await expect(
      verifyKeyCheck(key, {
        nonceBase64: vectors.key_check.nonce_base64,
        ciphertextBase64: vectors.key_check.ciphertext_base64,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects the key check with a wrong password", async () => {
    const wrongKey = await deriveKey(`${vectors.password}-errada`);
    await expect(
      verifyKeyCheck(wrongKey, {
        nonceBase64: vectors.key_check.nonce_base64,
        ciphertextBase64: vectors.key_check.ciphertext_base64,
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
  });

  it.each(vectors.messages)("decrypts the message: $description", async (message) => {
    const encryptedData = {
      nonceBase64: message.nonce_base64,
      ciphertextBase64: message.ciphertext_base64,
    };
    const plaintext = new TextDecoder().decode(await decrypt(key, encryptedData));
    expect(plaintext).toBe(message.plaintext);
    expect(await decryptPayload(key, encryptedData)).toEqual(JSON.parse(message.plaintext));
  });

  it("rejects a tampered ciphertext", async () => {
    const message = vectors.messages[0];
    const ciphertext = Uint8Array.from(atob(message.ciphertext_base64), (character) =>
      character.charCodeAt(0),
    );
    ciphertext[0] ^= 1;
    await expect(
      decrypt(key, { nonceBase64: message.nonce_base64, ciphertextBase64: bytesToBase64(ciphertext) }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
  });
});
