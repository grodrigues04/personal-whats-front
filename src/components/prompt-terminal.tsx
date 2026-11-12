"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "@/lib/api-client";
import { decrypt, ENCRYPTION_VERSION } from "@/lib/encryption/decryption";
import type { EncryptedTerminalChunk, TerminalStep } from "@/lib/prompt-sessions/statuses";
import {
  buildTerminalEntries,
  STEP_LABELS,
  type TerminalEntry,
} from "@/lib/prompt-sessions/terminal";

import { describeError, useDecryption } from "./decryption-provider";

const LIVE_REFRESH_INTERVAL_MILLISECONDS = 3_000;
const COLLAPSED_RESULT_LINES = 12;
// Distance from the bottom that still counts as "following" the output
const FOLLOW_THRESHOLD_PIXELS = 48;

type DecryptedChunk = { sequence: number; step: TerminalStep; lines: string[] };

/**
 * Visual copy of the terminal of Claude Code for one prompt: only shows what prompt_automator saved
 * (decrypted here with the key of the prompts). While the prompt runs, new output arrives every 3
 * seconds.
 */
export function PromptTerminal({
  sessionId,
  promptId,
  isLive,
}: {
  sessionId: string;
  promptId: string;
  isLive: boolean;
}) {
  const { promptKey } = useDecryption();
  const [chunks, setChunks] = useState<DecryptedChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSequence = useRef(-1);
  const container = useRef<HTMLDivElement>(null);
  const isFollowing = useRef(true);

  useEffect(() => {
    if (!promptKey) {
      return;
    }
    const controller = new AbortController();
    let isRunning = false;

    async function loadNewChunks() {
      if (isRunning || !promptKey) {
        return;
      }
      isRunning = true;
      try {
        // Big outputs come in pages of chunks: keeps asking until there is nothing new
        for (;;) {
          const { chunks: encryptedChunks } = await fetchJson<{
            chunks: EncryptedTerminalChunk[];
          }>(
            `/api/prompt-sessions/${encodeURIComponent(sessionId)}/prompts/${encodeURIComponent(
              promptId,
            )}/terminal?after=${lastSequence.current}`,
            controller.signal,
          );
          if (encryptedChunks.length === 0) {
            break;
          }
          const decryptedChunks: DecryptedChunk[] = [];
          for (const chunk of encryptedChunks) {
            if (chunk.encryption_version !== ENCRYPTION_VERSION) {
              throw new Error(`Versão de criptografia não suportada: ${chunk.encryption_version}`);
            }
            const plaintext = await decrypt(promptKey, {
              nonceBase64: chunk.nonce,
              ciphertextBase64: chunk.ciphertext,
            });
            const lines: unknown = JSON.parse(new TextDecoder().decode(plaintext));
            decryptedChunks.push({
              sequence: chunk.sequence,
              step: chunk.step,
              lines: Array.isArray(lines)
                ? lines.filter((line): line is string => typeof line === "string")
                : [],
            });
          }
          if (controller.signal.aborted) {
            return;
          }
          lastSequence.current = encryptedChunks[encryptedChunks.length - 1].sequence;
          setChunks((current) => [...current, ...decryptedChunks]);
        }
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(describeError(loadError));
        }
      } finally {
        isRunning = false;
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadNewChunks();
    const interval = isLive
      ? setInterval(() => {
          if (document.visibilityState === "visible") {
            loadNewChunks();
          }
        }, LIVE_REFRESH_INTERVAL_MILLISECONDS)
      : undefined;
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [promptKey, sessionId, promptId, isLive]);

  const entries = useMemo(() => buildTerminalEntries(chunks), [chunks]);

  // Keeps the end in view while the user did not scroll up to read something
  useLayoutEffect(() => {
    const element = container.current;
    if (element && isFollowing.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [entries]);

  function handleScroll() {
    const element = container.current;
    if (element) {
      isFollowing.current =
        element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_THRESHOLD_PIXELS;
    }
  }

  if (!promptKey) {
    return (
      <p className="text-xs text-zinc-500">Informe a senha dos prompts para ver o terminal.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-inner">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-2 font-mono text-[11px] text-zinc-400">claude · {promptId.slice(0, 8)}</span>
        {isLive && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            ao vivo
          </span>
        )}
      </div>
      <div
        ref={container}
        onScroll={handleScroll}
        className="max-h-[32rem] min-h-24 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {isLoading && entries.length === 0 ? (
          <p className="text-zinc-500">Carregando…</p>
        ) : entries.length === 0 ? (
          <p className="text-zinc-500">
            {isLive ? "Esperando a primeira saída do Claude…" : "Sem saída registrada."}
          </p>
        ) : (
          entries.map((entry, index) => <TerminalLine key={index} entry={entry} />)
        )}
        {isLive && entries.length > 0 && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-zinc-300 align-middle" />}
      </div>
      {error && (
        <p role="alert" className="border-t border-zinc-800 px-3 py-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function TerminalLine({ entry }: { entry: TerminalEntry }) {
  switch (entry.kind) {
    case "step":
      return (
        <div className="my-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-sky-400">
          <span className="h-px flex-1 bg-sky-900" />
          {STEP_LABELS[entry.step]}
          <span className="h-px flex-1 bg-sky-900" />
        </div>
      );
    case "info":
      return <p className="text-zinc-500">{entry.text}</p>;
    case "text":
      return (
        <p className="my-1 whitespace-pre-wrap break-words">
          <span className="mr-2 text-zinc-100">⏺</span>
          {entry.text}
        </p>
      );
    case "thinking":
      return (
        <details className="my-1 text-zinc-500">
          <summary className="cursor-pointer italic">✻ pensando…</summary>
          <p className="whitespace-pre-wrap break-words pl-4 italic">{entry.text}</p>
        </details>
      );
    case "tool":
      return (
        <details className="mt-1">
          <summary className="cursor-pointer break-words">
            <span className="mr-2 text-emerald-400">⏺</span>
            <span className="font-semibold">{entry.name}</span>
            {entry.summary && <span className="text-zinc-400">({entry.summary})</span>}
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-words pl-4 text-zinc-500">{entry.input}</pre>
        </details>
      );
    case "tool_result":
      return <ToolResult text={entry.text} isError={entry.isError} />;
    case "result":
      return (
        <div
          className={`mt-2 rounded border px-2 py-1 ${
            entry.isError ? "border-red-900 text-red-300" : "border-emerald-900 text-emerald-300"
          }`}
        >
          {entry.isError ? "✖ Terminou com erro" : "✔ Terminou"}
          {entry.durationSeconds !== null && ` · ${formatDuration(entry.durationSeconds)}`}
          {entry.turns !== null && ` · ${entry.turns} turnos`}
          {entry.text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-zinc-300">{entry.text}</p>
          )}
        </div>
      );
    case "raw":
      return <p className="whitespace-pre-wrap break-words text-zinc-400">{entry.text}</p>;
  }
}

function ToolResult({ text, isError }: { text: string; isError: boolean }) {
  const lines = text.replace(/\n+$/, "").split("\n");
  const color = isError ? "text-red-400" : "text-zinc-400";
  if (!text.trim()) {
    return <p className={`pl-4 ${color}`}>⎿ (sem saída)</p>;
  }
  const visibleLines = lines.slice(0, COLLAPSED_RESULT_LINES);
  const hiddenLines = lines.slice(COLLAPSED_RESULT_LINES);
  return (
    <div className={`pl-4 ${color}`}>
      <pre className="whitespace-pre-wrap break-words">
        <span className="text-zinc-600">⎿ </span>
        {visibleLines.join("\n")}
      </pre>
      {hiddenLines.length > 0 && (
        <details>
          <summary className="cursor-pointer text-zinc-600">
            … mais {hiddenLines.length} linhas
          </summary>
          <pre className="whitespace-pre-wrap break-words">{hiddenLines.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}min ${seconds % 60}s` : `${seconds}s`;
}
