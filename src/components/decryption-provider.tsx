"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";

import { fetchJson, type EncryptedResponse } from "@/lib/api-client";
import {
  decryptPayload,
  deriveKey,
  ENCRYPTION_VERSION,
  InvalidPasswordError,
  verifyKeyCheck,
  type DecryptedPayload,
} from "@/lib/encryption/decryption";

/**
 * Holds the encryption key only in React memory: a non-extractable CryptoKey, never the password,
 * and nothing in localStorage, sessionStorage, cookies or IndexedDB. Reloading the page or
 * "Bloquear" drops the key and every decrypted message.
 */
export type DecryptionResult =
  | { state: "loading" }
  | { state: "decrypted"; payload: DecryptedPayload }
  | { state: "error"; error: string };

type DecryptionContextValue = {
  isUnlocked: boolean;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  decryptedMessages: Record<string, DecryptionResult>;
  decryptMessage: (messageId: string) => Promise<void>;
  hideMessage: (messageId: string) => void;
};

const DecryptionContext = createContext<DecryptionContextValue | null>(null);

export function describeError(error: unknown): string {
  if (error instanceof InvalidPasswordError) {
    return "Não foi possível descriptografar: senha incorreta ou mensagem corrompida";
  }
  return error instanceof Error ? error.message : "Erro desconhecido ao descriptografar";
}

export function DecryptionProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, DecryptionResult>>({});

  const unlock = useCallback(async (password: string) => {
    const [candidateKey, keyCheck] = await Promise.all([
      deriveKey(password),
      fetchJson<EncryptedResponse>("/api/key-check"),
    ]);
    // Raises InvalidPasswordError before any message is decrypted with a wrong key
    await verifyKeyCheck(candidateKey, {
      nonceBase64: keyCheck.nonce,
      ciphertextBase64: keyCheck.ciphertext,
    });
    setKey(candidateKey);
  }, []);

  const lock = useCallback(() => {
    setKey(null);
    setDecryptedMessages({});
  }, []);

  const decryptMessage = useCallback(
    async (messageId: string) => {
      if (!key) {
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
        const payload = await decryptPayload(key, {
          nonceBase64: encrypted.nonce,
          ciphertextBase64: encrypted.ciphertext,
        });
        setResult({ state: "decrypted", payload });
      } catch (error) {
        setResult({ state: "error", error: describeError(error) });
      }
    },
    [key],
  );

  const hideMessage = useCallback((messageId: string) => {
    setDecryptedMessages((current) => {
      const remaining = { ...current };
      delete remaining[messageId];
      return remaining;
    });
  }, []);

  const value = useMemo(
    () => ({
      isUnlocked: key !== null,
      unlock,
      lock,
      decryptedMessages,
      decryptMessage,
      hideMessage,
    }),
    [key, unlock, lock, decryptedMessages, decryptMessage, hideMessage],
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
