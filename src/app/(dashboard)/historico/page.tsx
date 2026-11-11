import type { Metadata } from "next";

import { MessagesView } from "@/components/messages-view";

export const metadata: Metadata = { title: "Histórico · Personal Whats" };

export default function HistoryPage() {
  return <MessagesView view="history" title="Histórico" />;
}
