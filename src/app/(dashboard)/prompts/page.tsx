import type { Metadata } from "next";

import { PromptSessionsView } from "@/components/prompt-sessions-view";
import { UnlockPanel } from "@/components/unlock-panel";

export const metadata: Metadata = { title: "Prompts · Personal Whats" };

export default function PromptsPage() {
  return (
    <>
      <UnlockPanel scope="prompts" />
      <PromptSessionsView />
    </>
  );
}
