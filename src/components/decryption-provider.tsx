"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";

import { fetchJson, type EncryptedPromptsResponse, type EncryptedResponse } from "@/lib/api-client";
import {
  decryptPayload,
  deriveKey,
  ENCRYPTION_VERSION,
  InvalidPasswordError,
  verifyKeyCheck,
  type DecryptedPayload,
} from "@/lib/encryption/decryption";
import { decryptPromptContent, type DecryptedPromptContent } from "@/lib/encryption/prompt-content";

/**
 * Holds the encryption keys only in React memory: non-extractable CryptoKeys, never the passwords,
 * and nothing in localStorage, sessionStorage, cookies or IndexedDB. Reloading the page or
 * "Bloquear" drops the key and everything decrypted with it.
 *
 * Two keys, each with its own password: `messages` (ENCRYPTION_PASSWORD, WhatsApp messages, admin
 * only) and `prompts` (PROMPT_ENCRYPTION_PASSWORD, prompt sessions, terminal, and the prompts and
 * answers sent from here).
 */
export type KeyScope = "messages" | "prompts";

const KEY_CHECK_URLS: Record<KeyScope, string> = {
  messages: "/api/key-check",
  prompts: "/api/prompt-key-check",
};

const KEY_USAGES: Record<KeyScope, KeyUsage[]> = {
  messages: ["decrypt"],
  prompts: ["encrypt", "decrypt"],
};

export type DecryptionResult =
  | { state: "loading" }
  | { state: "decrypted"; payload: DecryptedPayload }
  | { state: "error"; error: string };

/** Each prompt is decrypted on its own: one corrupted prompt does not hide the others. */
export type PromptDecryptionResult =
  | { state: "decrypted"; content: DecryptedPromptContent }
  | { state: "error"; error: string };

export type SessionDecryptionResult =
  | { state: "loading" }
  | { state: "decrypted"; prompts: Record<string, PromptDecryptionResult> }
  | { state: "error"; error: string };

type DecryptionContextValue = {
  isUnlocked: (scope: KeyScope) => boolean;
  unlock: (scope: KeyScope, password: string) => Promise<void>;
  lock: (scope: KeyScope) => void;
  promptKey: CryptoKey | null;
  decryptedMessages: Record<string, DecryptionResult>;
  decryptMessage: (messageId: string) => Promise<void>;
  hideMessage: (messageId: string) => void;
  decryptedSessions: Record<string, SessionDecryptionResult>;
  /** `silent` keeps what is shown while it decrypts again (live sessions). */
  decryptSession: (sessionId: string, options?: { silent?: boolean }) => Promise<void>;
  hideSession: (sessionId: string) => void;
};

const DecryptionContext = createContext<DecryptionContextValue | null>(null);

export function describeError(error: unknown): string {
  if (error instanceof InvalidPasswordError) {
    return "Não foi possível descriptografar: senha incorreta ou mensagem corrompida";
  }
  return error instanceof Error ? error.message : "Erro desconhecido ao descriptografar";
}

export function DecryptionProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<Partial<Record<KeyScope, CryptoKey>>>({});
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, DecryptionResult>>({});
  const [decryptedSessions, setDecryptedSessions] = useState<
    Record<string, SessionDecryptionResult>
  >({});
  const messageKey = keys.messages ?? null;
  const promptKey = keys.prompts ?? null;

  const isUnlocked = useCallback((scope: KeyScope) => keys[scope] !== undefined, [keys]);

  const unlock = useCallback(async (scope: KeyScope, password: string) => {
    const [candidateKey, keyCheck] = await Promise.all([
      deriveKey(password, false, KEY_USAGES[scope]),
      fetchJson<EncryptedResponse>(KEY_CHECK_URLS[scope]),
    ]);
    // Raises InvalidPasswordError before anything is decrypted with a wrong key
    await verifyKeyCheck(candidateKey, {
      nonceBase64: keyCheck.nonce,
      ciphertextBase64: keyCheck.ciphertext,
    });
    setKeys((current) => ({ ...current, [scope]: candidateKey }));
  }, []);

  const lock = useCallback((scope: KeyScope) => {
    setKeys((current) => {
      const remaining = { ...current };
      delete remaining[scope];
      return remaining;
    });
    if (scope === "messages") {
      setDecryptedMessages({});
    } else {
      setDecryptedSessions({});
    }
  }, []);

  const decryptMessage = useCallback(
    async (messageId: string) => {
      if (!messageKey) {
        return;
      }
      const setResult = (result: DecryptionResult) =>
        setDecryptedMessages((current) => ({ ...current, [messageId]: result }));
      setResult({ state: "loading" });
      try {
        const encrypted = await fetchJson<EncryptedResponse>(
          `/api/messages/${encodeURIComponent(messageId)}/encrypted`,
        );
        if (encrypted.encryption_version !== ENCRYPTION_VERSION) {
          throw new Error(`Versão de criptografia não suportada: ${encrypted.encryption_version}`);
        }
        const payload = await decryptPayload(messageKey, {
          nonceBase64: encrypted.nonce,
          ciphertextBase64: encrypted.ciphertext,
        });
        setResult({ state: "decrypted", payload });
      } catch (error) {
        setResult({ state: "error", error: describeError(error) });
      }
    },
    [messageKey],
  );

  const hideMessage = useCallback((messageId: string) => {
    setDecryptedMessages((current) => {
      const remaining = { ...current };
      delete remaining[messageId];
      return remaining;
    });
  }, []);

  const decryptSession = useCallback(
    async (sessionId: string, { silent = false }: { silent?: boolean } = {}) => {
      if (!promptKey) {
        return;
      }
      const setResult = (result: SessionDecryptionResult) =>
        setDecryptedSessions((current) => ({ ...current, [sessionId]: result }));
      if (!silent) {
        setResult({ state: "loading" });
      }
      try {
        const encrypted = await fetchJson<EncryptedPromptsResponse>(
          `/api/prompt-sessions/${encodeURIComponent(sessionId)}/encrypted`,
        );
        const prompts: Record<string, PromptDecryptionResult> = {};
        for (const encryptedPrompt of encrypted.prompts) {
          try {
            if (encryptedPrompt.encryption_version !== ENCRYPTION_VERSION) {
              throw new Error(
                `Versão de criptografia não suportada: ${encryptedPrompt.encryption_version}`,
              );
            }
            const content = await decryptPromptContent(promptKey, {
              nonceBase64: encryptedPrompt.nonce,
              ciphertextBase64: encryptedPrompt.ciphertext,
            });
            prompts[encryptedPrompt.id] = { state: "decrypted", content };
          } catch (error) {
            prompts[encryptedPrompt.id] = { state: "error", error: describeError(error) };
          }
        }
        setResult({ state: "decrypted", prompts });
      } catch (error) {
        if (!silent) {
          setResult({ state: "error", error: describeError(error) });
        }
      }
    },
    [promptKey],
  );

  const hideSession = useCallback((sessionId: string) => {
    setDecryptedSessions((current) => {
      const remaining = { ...current };
      delete remaining[sessionId];
      return remaining;
    });
  }, []);

  const value = useMemo(
    () => ({
      isUnlocked,
      unlock,
      lock,
      promptKey,
      decryptedMessages,
      decryptMessage,
      hideMessage,
      decryptedSessions,
      decryptSession,
      hideSession,
    }),
    [
      isUnlocked,
      unlock,
      lock,
      promptKey,
      decryptedMessages,
      decryptMessage,
      hideMessage,
      decryptedSessions,
      decryptSession,
      hideSession,
    ],
  );

  return <DecryptionContext value={value}>{children}</DecryptionContext>;
}

export function useDecryption(): DecryptionContextValue {
  const context = use(DecryptionContext);
  if (!context) {
    throw new Error("useDecryption must be used within a DecryptionProvider");
  }
  return context;
}
