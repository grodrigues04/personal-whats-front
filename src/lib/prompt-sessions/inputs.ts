/**
 * Validation of a prompt or answer sent to POST /api/prompt-sessions/[sessionId]/inputs. The
 * content arrives already encrypted by the browser with the key of the prompts: the server only
 * checks its shape and the state of the session. Kept free of Next.js imports for the tests.
 */
import { ENCRYPTION_VERSION, NONCE_SIZE } from "@/lib/encryption/decryption";

import {
  PROMPT_ID_PATTERN,
  PROMPT_INPUT_KINDS,
  type PromptInputKind,
  type PromptSessionStatus,
  type PromptStatus,
} from "./statuses";

// 4.000 characters of text (prompt_automator refuses more) in UTF-8 and JSON, with room to spare
const MAXIMUM_CIPHERTEXT_SIZE = 64 * 1024;
const GCM_TAG_SIZE = 16;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type ValidInput = {
  kind: PromptInputKind;
  promptId: string | null;
  nonce: Buffer;
  ciphertext: Buffer;
};

export type SessionStateForInput = {
  status: PromptSessionStatus;
  prompts: { id: string; status: PromptStatus }[];
};

function decodeBase64(value: unknown): Buffer | null {
  if (typeof value !== "string" || !BASE64_PATTERN.test(value)) {
    return null;
  }
  return Buffer.from(value, "base64");
}

/** Returns the error shown to the user, or the input ready to be saved. */
export function validateInput(
  body: unknown,
  sessionState: SessionStateForInput,
): { error: string } | { input: ValidInput } {
  if (typeof body !== "object" || body === null) {
    return { error: "Envio inválido" };
  }
  const { kind, prompt_id, encryption_version, nonce, ciphertext } = body as Record<
    string,
    unknown
  >;
  if (!PROMPT_INPUT_KINDS.includes(kind as PromptInputKind)) {
    return { error: "Tipo de envio inválido" };
  }
  if (encryption_version !== ENCRYPTION_VERSION) {
    return { error: "Versão de criptografia não suportada" };
  }
  const nonceBytes = decodeBase64(nonce);
  const ciphertextBytes = decodeBase64(ciphertext);
  if (
    !nonceBytes ||
    nonceBytes.length !== NONCE_SIZE ||
    !ciphertextBytes ||
    ciphertextBytes.length <= GCM_TAG_SIZE ||
    ciphertextBytes.length > MAXIMUM_CIPHERTEXT_SIZE
  ) {
    return { error: "Conteúdo criptografado inválido ou grande demais" };
  }

  if (kind === "prompt") {
    if (sessionState.status !== "active") {
      return { error: "A sessão não aceita mais prompts" };
    }
    return {
      input: { kind, promptId: null, nonce: nonceBytes, ciphertext: ciphertextBytes },
    };
  }

  if (typeof prompt_id !== "string" || !PROMPT_ID_PATTERN.test(prompt_id)) {
    return { error: "Prompt inválido" };
  }
  const prompt = sessionState.prompts.find((candidate) => candidate.id === prompt_id);
  if (!prompt || prompt.status !== "waiting_answers") {
    return { error: "Este prompt não está esperando respostas" };
  }
  return {
    input: { kind: "answer", promptId: prompt_id, nonce: nonceBytes, ciphertext: ciphertextBytes },
  };
}
