import { Suspense } from "react";

import { DecryptionProvider } from "@/components/decryption-provider";
import { NavigationLinks } from "@/components/navigation-links";
import { UnlockPanel } from "@/components/unlock-panel";
import { logout } from "@/lib/actions/authentication";
import { requireSession } from "@/lib/auth/server";

/** Checks the session on the server, besides the proxy, before rendering any page. */
async function SessionGate({ children }: { children: React.ReactNode }) {
  await requireSession();
  return children;
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <DecryptionProvider>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">Personal Whats</span>
            <NavigationLinks />
          </div>
          <form action={logout}>
            <button type="submit" className="button-secondary">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
        <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
          <SessionGate>
            <UnlockPanel />
            {children}
          </SessionGate>
        </Suspense>
      </main>
    </DecryptionProvider>
  );
}
