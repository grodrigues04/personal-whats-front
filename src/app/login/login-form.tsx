"use client";

import { useActionState } from "react";

import { login, type LoginState } from "@/lib/actions/authentication";

const INITIAL_STATE: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Usuário
        <input
          name="username"
          autoComplete="username"
          required
          className="input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={isPending} className="button-primary">
        {isPending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
