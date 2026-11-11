import type { Metadata } from "next";

import { MessagesView } from "@/components/messages-view";

export const metadata: Metadata = { title: "Fila · Personal Whats" };

export default function QueuePage() {
  return <MessagesView view="queue" title="Fila" />;
}
