import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Personal Whats" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold">Personal Whats</h1>
        <p className="mb-6 text-sm text-zinc-500">Entre para ver a fila de mensagens.</p>
        <LoginForm />
      </div>
    </main>
  );
}
