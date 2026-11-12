import type { Metadata } from "next";

import { MessagesView } from "@/components/messages-view";
import { UnlockPanel } from "@/components/unlock-panel";
import { requireAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Histórico · Personal Whats" };

export default async function HistoryPage() {
  await requireAdmin();
  return (
    <>
      <UnlockPanel scope="messages" />
      <MessagesView view="history" title="Histórico" />
    </>
  );
}
