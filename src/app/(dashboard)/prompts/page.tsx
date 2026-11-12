import type { Metadata } from "next";

import { PromptSessionsView } from "@/components/prompt-sessions-view";

export const metadata: Metadata = { title: "Prompts · Personal Whats" };

export default function PromptsPage() {
  return <PromptSessionsView />;
}
