/**
 * Decryption of the personalWhats queue, encryption version 1 (see the README of
 * interface-personal-whats). Uses only WebCrypto, so it runs in the browser: the password and the
 * key never reach the server. Must stay in sync with interface_personal_whats/crypto.py and
 * tests/vectors/v1.json.
 */

export const ENCRYPTION_VERSION = 1;
export const KEY_DERIVATION_SALT = "personal-whats/v1";
export const KEY_DERIVATION_ITERATIONS = 600_000;
export const KEY_SIZE_BITS = 256;
export const NONCE_SIZE = 12;
export const KEY_CHECK_PLAINTEXT = "personal-whats-key-check";

export type EncryptedData = {
  nonceBase64: string;
  ciphertextBase64: string; // ciphertext followed by the 16 byte GCM tag
};

export type DecryptedAttachment = {
  file_name: string;
  mimetype: string;
  content: string; // base64
  caption: string | null;
};

/** Received WhatsApp message that the sent one replies to ("Responder"). */
export type QuotedMessage = {
  chat_jid: string;
  message_id: string;
  participant: string | null;
  from_me: boolean;
  text: string | null;
};

export type DecryptedPayload = {
  text: string | null;
  recipient: string | null; // null means the default recipient configured in personalWhats
  attachments: DecryptedAttachment[];
  quoted: QuotedMessage | null;
};

/** Wrong password or tampered data: AES-GCM could not authenticate the ciphertext. */
export class InvalidPasswordError extends Error {
  constructor() {
    super("Senha de criptografia incorreta");
    this.name = "InvalidPasswordError";
  }
}

export class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPayloadError";
  }
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * PBKDF2-HMAC-SHA256 with the fixed salt. The key is not extractable by default, so it can be kept
 * in memory without exposing its bytes; `extractable` exists only for the test vectors.
 */
export async function deriveKey(password: string, extractable = false): Promise<CryptoKey> {
  if (!password) {
    throw new Error("A senha de criptografia é obrigatória");
  }
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
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
    extractable,
    ["decrypt"],
  );
}

/** Raises InvalidPasswordError when the key is wrong or the data was tampered with. */
export async function decrypt(key: CryptoKey, encryptedData: EncryptedData): Promise<Uint8Array> {
  const nonce = base64ToBytes(encryptedData.nonceBase64);
  if (nonce.length !== NONCE_SIZE) {
    throw new InvalidPayloadError(`O nonce deveria ter ${NONCE_SIZE} bytes`);
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      base64ToBytes(encryptedData.ciphertextBase64),
    );
    return new Uint8Array(plaintext);
  } catch (error) {
    if (error instanceof DOMException && error.name === "OperationError") {
      throw new InvalidPasswordError();
    }
    throw error;
  }
}

export async function verifyKeyCheck(key: CryptoKey, keyCheck: EncryptedData): Promise<void> {
  const plaintext = new TextDecoder().decode(await decrypt(key, keyCheck));
  if (plaintext !== KEY_CHECK_PLAINTEXT) {
    throw new InvalidPasswordError();
  }
}

export function parsePayload(plaintext: Uint8Array): DecryptedPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new InvalidPayloadError("O conteúdo descriptografado não é um JSON válido");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new InvalidPayloadError("O conteúdo descriptografado não é um objeto");
  }
  const { text, recipient, attachments, quoted } = payload as Record<string, unknown>;
  if (!Array.isArray(attachments ?? [])) {
    throw new InvalidPayloadError("Os anexos descriptografados são inválidos");
  }
  return {
    text: typeof text === "string" ? text : null,
    recipient: typeof recipient === "string" ? recipient : null,
    attachments: ((attachments as unknown[] | undefined) ?? []).map(parseAttachment),
    quoted: parseQuoted(quoted),
  };
}

function parseQuoted(quoted: unknown): QuotedMessage | null {
  if (quoted === null || quoted === undefined) {
    return null;
  }
  const { chat_jid, message_id, participant, from_me, text } = quoted as Record<string, unknown>;
  if (typeof chat_jid !== "string" || typeof message_id !== "string") {
    throw new InvalidPayloadError("A mensagem citada descriptografada é inválida");
  }
  return {
    chat_jid,
    message_id,
    participant: typeof participant === "string" ? participant : null,
    from_me: from_me === true,
    text: typeof text === "string" ? text : null,
  };
}

function parseAttachment(attachment: unknown): DecryptedAttachment {
  const { file_name, mimetype, content, caption } = (attachment ?? {}) as Record<string, unknown>;
  if (typeof file_name !== "string" || typeof mimetype !== "string" || typeof content !== "string") {
    throw new InvalidPayloadError("Um anexo descriptografado é inválido");
  }
  return {
    file_name,
    mimetype,
    content,
    caption: typeof caption === "string" ? caption : null,
  };
}

export async function decryptPayload(
  key: CryptoKey,
  encryptedData: EncryptedData,
): Promise<DecryptedPayload> {
  return parsePayload(await decrypt(key, encryptedData));
}
