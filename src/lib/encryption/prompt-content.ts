/**
 * Content of the prompts of prompt_automator, encrypted with the same scheme as the messages (see
 * decryption.ts) but with the key of the prompts (PROMPT_ENCRYPTION_PASSWORD). Runs in the
 * browser: the key never reaches the server.
 */
import { decrypt, InvalidPayloadError, type EncryptedData } from "./decryption";

export type DecryptedPromptContent = {
  sender_name: string | null; // who sent the prompt
  text: string; // the prompt
  result: string | null; // what was implemented, or why it was cancelled, rejected or failed
  questions: string[]; // asked by Claude, answered in the group or in the frontend
  answers: string | null;
  answered_by: string | null; // who answered through the frontend; null for the group
};

export function parsePromptContent(plaintext: Uint8Array): DecryptedPromptContent {
  let content: unknown;
  try {
    content = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new InvalidPayloadError("O conteúdo descriptografado não é um JSON válido");
  }
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    throw new InvalidPayloadError("O conteúdo descriptografado não é um objeto");
  }
  const { sender_name, text, result, questions, answers, answered_by } = content as Record<
    string,
    unknown
  >;
  if (typeof text !== "string") {
    throw new InvalidPayloadError("O texto do prompt descriptografado é inválido");
  }
  return {
    sender_name: typeof sender_name === "string" ? sender_name : null,
    text,
    result: typeof result === "string" ? result : null,
    questions: Array.isArray(questions)
      ? questions.filter((question): question is string => typeof question === "string")
      : [],
    answers: typeof answers === "string" ? answers : null,
    answered_by: typeof answered_by === "string" ? answered_by : null,
  };
}

export async function decryptPromptContent(
  key: CryptoKey,
  encryptedData: EncryptedData,
): Promise<DecryptedPromptContent> {
  return parsePromptContent(await decrypt(key, encryptedData));
}
