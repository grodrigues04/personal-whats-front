"use client";

import type { DecryptedPromptContent } from "@/lib/encryption/prompt-content";

export function DecryptedPrompt({ content }: { content: DecryptedPromptContent }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
      <div>
        <span className="text-zinc-500">Enviado por: </span>
        <span className="font-medium">{content.sender_name ?? "desconhecido"}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">{content.text}</p>
      <div>
        <span className="text-xs text-zinc-500">Resultado</span>
        {content.result ? (
          <p className="whitespace-pre-wrap break-words">{content.result}</p>
        ) : (
          <p className="italic text-zinc-500">Sem resultado ainda</p>
        )}
      </div>
    </div>
  );
}
