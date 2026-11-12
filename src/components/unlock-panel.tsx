"use client";

import { useRef, useState } from "react";

import { InvalidPasswordError } from "@/lib/encryption/decryption";

import { describeError, useDecryption, type KeyScope } from "./decryption-provider";

const LABELS: Record<KeyScope, string> = {
  messages: "Senha de criptografia",
  prompts: "Senha dos prompts",
};

export function UnlockPanel({ scope }: { scope: KeyScope }) {
  const { isUnlocked: isScopeUnlocked, unlock, lock } = useDecryption();
  const isUnlocked = isScopeUnlocked(scope);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = passwordInput.current;
    const password = input?.value ?? "";
    if (!password) {
      return;
    }
    setIsChecking(true);
    setError(null);
    try {
      await unlock(scope, password);
    } catch (unlockError) {
      setError(
        unlockError instanceof InvalidPasswordError
          ? `${LABELS[scope]} incorreta`
          : describeError(unlockError),
      );
    } finally {
      // The password never stays anywhere, not even in the field
      if (input) {
        input.value = "";
      }
      setIsChecking(false);
    }
  }

  if (isUnlocked) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <span>Descriptografia liberada nesta aba. A chave fica só na memória do navegador.</span>
        <button type="button" onClick={() => lock(scope)} className="button-secondary">
          Bloquear
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto sm:min-w-64 sm:flex-1">
          {LABELS[scope]}
          <input
            ref={passwordInput}
            type="password"
            autoComplete="off"
            className="input"
            placeholder="Usada só no navegador"
          />
        </label>
        <button type="submit" disabled={isChecking} className="button-primary w-full sm:w-auto">
          {isChecking ? "Verificando…" : "Liberar descriptografia"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
