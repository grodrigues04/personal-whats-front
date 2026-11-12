"use client";

import { base64ToBytes, type DecryptedAttachment, type DecryptedPayload } from "@/lib/encryption/decryption";
import { formatBytes } from "@/lib/format";

const BLOB_URL_LIFETIME_MILLISECONDS = 60_000;

function downloadAttachment(attachment: DecryptedAttachment) {
  const blob = new Blob([base64ToBytes(attachment.content)], { type: attachment.mimetype });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MILLISECONDS);
}

function decodedSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function DecryptedMessage({ payload }: { payload: DecryptedPayload }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
      <div>
        <span className="text-zinc-500">Destinatário: </span>
        <span className="font-mono">{payload.recipient ?? "contato padrão"}</span>
      </div>
      {payload.reaction ? (
        <p>
          <span className="text-zinc-500">Reação: </span>
          {payload.reaction}
        </p>
      ) : payload.text ? (
        <p className="whitespace-pre-wrap break-words">{payload.text}</p>
      ) : (
        <p className="italic text-zinc-500">Sem texto</p>
      )}
      {payload.attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {payload.attachments.map((attachment, index) => (
            <li
              key={`${attachment.file_name}-${index}`}
              className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{attachment.file_name}</span>
                <span className="text-xs text-zinc-500">
                  {attachment.mimetype} · {formatBytes(decodedSize(attachment.content))}
                </span>
                {attachment.caption && (
                  <span className="whitespace-pre-wrap text-xs">{attachment.caption}</span>
                )}
              </div>
              <button
                type="button"
                className="button-secondary w-full sm:w-auto"
                onClick={() => downloadAttachment(attachment)}
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
