import type { Metadata } from "next";

import { MessagesView } from "@/components/messages-view";
import { UnlockPanel } from "@/components/unlock-panel";
import { requireAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Fila · Personal Whats" };

export default async function QueuePage() {
  await requireAdmin();
  return (
    <>
      <UnlockPanel scope="messages" />
      <MessagesView view="queue" title="Fila" />
    </>
  );
}
