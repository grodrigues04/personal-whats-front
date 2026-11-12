import { beforeAll, describe, expect, it } from "vitest";

import {
  bytesToBase64,
  InvalidPayloadError,
  KEY_DERIVATION_ITERATIONS,
  KEY_DERIVATION_SALT,
  KEY_SIZE_BITS,
  NONCE_SIZE,
  type EncryptedData,
} from "@/lib/encryption/decryption";
import { decryptPromptContent, parsePromptContent } from "@/lib/encryption/prompt-content";

const PASSWORD = "senha de teste";

// Same derivation as deriveKey, but able to encrypt: the frontend itself only decrypts
async function deriveEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(PASSWORD),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(KEY_DERIVATION_SALT),
      iterations: KEY_DERIVATION_ITERATIONS,
    },
    passwordKey,
    { name: "AES-GCM", length: KEY_SIZE_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedData> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    nonceBase64: bytesToBase64(nonce),
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("prompt content", () => {
  let key: CryptoKey;

  beforeAll(async () => {
    key = await deriveEncryptionKey();
  });

  it("decrypts and parses a prompt", async () => {
    const content = {
      sender_name: "Matheus",
      text: "Adicione um botão de curtir nos comentários",
      result: "Botão de curtir adicionado",
      questions: ["Em todos os comentários?"],
      answers: "sim",
      answered_by: "Arthur",
    };
    const encryptedData = await encrypt(key, JSON.stringify(content));
    expect(await decryptPromptContent(key, encryptedData)).toEqual(content);
  });

  it("accepts a missing sender, result and questions (prompts saved before them)", () => {
    expect(parsePromptContent(encode(JSON.stringify({ sender_name: null, text: "Oi" })))).toEqual({
      sender_name: null,
      text: "Oi",
      result: null,
      questions: [],
      answers: null,
      answered_by: null,
    });
  });

  it.each([
    ["not JSON", "não é json"],
    ["not an object", "[1, 2]"],
    ["null", "null"],
    ["without text", JSON.stringify({ sender_name: "Ana", result: null })],
    ["with a non string text", JSON.stringify({ text: 42 })],
  ])("rejects content %s", (_description, plaintext) => {
    expect(() => parsePromptContent(encode(plaintext))).toThrow(InvalidPayloadError);
  });
});
