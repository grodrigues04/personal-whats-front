"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, fetchJson } from "@/lib/api-client";
import { encryptJson, ENCRYPTION_VERSION } from "@/lib/encryption/decryption";
import { formatDate } from "@/lib/format";
import { buildSessionQueue } from "@/lib/prompt-sessions/queue";
import {
  PROMPT_STATUS_LABELS,
  type PromptInputKind,
  type PromptInputSummary,
  type PromptSessionSummary,
  type PromptSummary,
} from "@/lib/prompt-sessions/statuses";

import { describeError, useDecryption, type SessionDecryptionResult } from "./decryption-provider";
import { PromptSessionStatusBadge } from "./prompt-status-badges";
import { PromptTerminal } from "./prompt-terminal";

const INPUTS_REFRESH_INTERVAL_MILLISECONDS = 5_000;
// prompt_automator refuses longer prompts and answers
const MAXIMUM_TEXT_LENGTH = 4_000;
const PREVIEW_LENGTH = 140;

const INPUT_STATUS_LABELS: Record<PromptInputSummary["status"], string> = {
  pending: "aguardando o prompt_automator",
  accepted: "aceito",
  refused: "recusado",
};

/**
 * The session running now: its queue, the live terminal of the prompt being executed, and the
 * forms to send a prompt and to answer the questions of Claude. Everything sent is encrypted here,
 * with the key of the prompts, before reaching the server.
 */
export function ActiveSessionPanel({
  session,
  onSent,
}: {
  session: PromptSessionSummary;
  onSent: () => void;
}) {
  const { isUnlocked, promptKey, decryptedSessions } = useDecryption();
  const decryption = decryptedSessions[session.id];
  const queue = buildSessionQueue(session);
  const [inputs, setInputs] = useState<PromptInputSummary[]>([]);
  const [inputsRefreshCount, setInputsRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchJson<{ inputs: PromptInputSummary[] }>(
        `/api/prompt-sessions/${encodeURIComponent(session.id)}/inputs`,
        controller.signal,
      )
        .then((result) => setInputs(result.inputs))
        .catch(() => {
          // Shown again on the next refresh; the queue itself does not depend on it
        });
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
      }
    }, INPUTS_REFRESH_INTERVAL_MILLISECONDS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [session.id, inputsRefreshCount]);

  const sendInput = useCallback(
    async (kind: PromptInputKind, text: string, promptId: string | null) => {
      if (!promptKey) {
        throw new Error("Informe a senha dos prompts antes de enviar");
      }
      const encrypted = await encryptJson(promptKey, { text });
      const response = await fetch(
        `/api/prompt-sessions/${encodeURIComponent(session.id)}/inputs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            prompt_id: promptId,
            encryption_version: ENCRYPTION_VERSION,
            nonce: encrypted.nonceBase64,
            ciphertext: encrypted.ciphertextBase64,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(body?.error ?? `Erro ${response.status}`, response.status);
      }
      setInputsRefreshCount((count) => count + 1);
      onSent();
    },
    [promptKey, session.id, onSent],
  );

  const contentOf = (prompt: PromptSummary) =>
    decryption?.state === "decrypted" ? decryption.prompts[prompt.id] : undefined;
  const currentContent = queue.current ? contentOf(queue.current) : undefined;
  const pendingAnswer = inputs.find(
    (input) =>
      input.kind === "answer" &&
      input.prompt_id === queue.current?.id &&
      input.status !== "refused",
  );
  const myInputs = inputs.filter((input) => input.is_mine).slice(0, 5);

  let sendBlockedReason: string | null = null;
  if (!isUnlocked("prompts")) {
    sendBlockedReason = "Informe a senha dos prompts no topo da página para enviar.";
  } else if (session.status !== "active") {
    sendBlockedReason = "A sessão não aceita mais prompts: a fila está terminando.";
  } else if (queue.isLimitReached) {
    sendBlockedReason = "O limite de prompts da sessão foi atingido.";
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3 sm:p-4 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
          </span>
          <h2 className="text-lg font-semibold">Sessão em andamento</h2>
          <PromptSessionStatusBadge status={session.status} />
          <span className="text-sm text-zinc-500">{session.chat_name}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Counter label="Fila" value={String(queue.total)} />
          {session.prompt_limit !== null && (
            <Counter
              label="Limite de prompts"
              value={`${queue.usedCount}/${session.prompt_limit}`}
              isWarning={queue.isLimitReached}
            />
          )}
          <Counter label="Aceita prompts até" value={formatDate(session.ends_at)} />
        </div>
      </div>

      <QueueVisual
        queue={queue}
        decryption={decryption}
        sessionStatus={session.status}
      />

      {queue.current?.status === "waiting_answers" && (
        <AnswerForm
          key={queue.current.id}
          questions={currentContent?.state === "decrypted" ? currentContent.content.questions : []}
          isUnlocked={isUnlocked("prompts")}
          pendingAnswer={pendingAnswer ?? null}
          onSubmit={(text) => sendInput("answer", text, queue.current!.id)}
        />
      )}

      {queue.current && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Terminal do prompt em execução</h3>
          <PromptTerminal
            key={queue.current.id}
            sessionId={session.id}
            promptId={queue.current.id}
            isLive
          />
        </div>
      )}

      <PromptForm
        blockedReason={sendBlockedReason}
        onSubmit={(text) => sendInput("prompt", text, null)}
      />

      {myInputs.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-zinc-500">Seus envios nesta sessão</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {myInputs.map((input) => (
              <li key={input.id} className="flex flex-wrap gap-x-2">
                <span className="text-zinc-500">{formatDate(input.created_at)}</span>
                <span>{input.kind === "prompt" ? "Prompt" : "Resposta"}</span>
                <span
                  className={
                    input.status === "refused"
                      ? "text-red-600 dark:text-red-400"
                      : input.status === "accepted"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                  }
                >
                  {INPUT_STATUS_LABELS[input.status]}
                  {input.refusal_reason && `: ${input.refusal_reason}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Counter({
  label,
  value,
  isWarning = false,
}: {
  label: string;
  value: string;
  isWarning?: boolean;
}) {
  return (
    <span
      className={`rounded-md border px-2 py-1 ${
        isWarning
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      <span className="text-zinc-500">{label}: </span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function QueueVisual({
  queue,
  decryption,
  sessionStatus,
}: {
  queue: ReturnType<typeof buildSessionQueue>;
  decryption: SessionDecryptionResult | undefined;
  sessionStatus: PromptSessionSummary["status"];
}) {
  const describe = (prompt: PromptSummary) => {
    const result = decryption?.state === "decrypted" ? decryption.prompts[prompt.id] : undefined;
    if (result?.state !== "decrypted") {
      return { sender: null, text: null };
    }
    const text = result.content.text;
    return {
      sender: result.content.sender_name,
      text: text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text,
    };
  };

  if (queue.total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sky-300 p-4 text-center text-sm text-zinc-500 dark:border-sky-800">
        {sessionStatus === "active"
          ? "A fila está vazia. O próximo prompt começa na hora."
          : "A fila acabou."}
      </p>
    );
  }

  const items = [...(queue.current ? [queue.current] : []), ...queue.waiting];
  return (
    <ol className="flex flex-col gap-2">
      {items.map((prompt, index) => {
        const isCurrent = prompt === queue.current;
        const { sender, text } = describe(prompt);
        return (
          <li
            key={prompt.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              isCurrent
                ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <span
              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                isCurrent
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {index + 1}/{queue.total}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2 text-xs">
                <span className="font-medium">
                  {isCurrent ? PROMPT_STATUS_LABELS[prompt.status] : "Na fila"}
                </span>
                {sender && <span className="text-zinc-500">· {sender}</span>}
                {prompt.source === "frontend" && <span className="text-zinc-500">· pelo frontend</span>}
                <span className="text-zinc-400">
                  · {isCurrent && prompt.started_at ? `desde ${formatDate(prompt.started_at)}` : `recebido ${formatDate(prompt.received_at)}`}
                </span>
              </div>
              <p className="break-words text-sm text-zinc-700 dark:text-zinc-300">
                {text ?? <span className="italic text-zinc-400">criptografado</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PromptForm({
  blockedReason,
  onSubmit,
}: {
  blockedReason: string | null;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    setIsSending(true);
    setError(null);
    setNotice(null);
    try {
      await onSubmit(text.trim());
      setText("");
      setNotice("Enviado. Em alguns segundos ele entra na fila e o grupo é avisado.");
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Novo prompt
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAXIMUM_TEXT_LENGTH}
          rows={3}
          disabled={blockedReason !== null || isSending}
          placeholder="O que o Claude deve implementar no Squeaker?"
          className="input resize-y font-normal"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">
          {blockedReason ?? `${text.length}/${MAXIMUM_TEXT_LENGTH} · passa pela revisão de segurança antes de rodar`}
        </span>
        <button
          type="submit"
          disabled={blockedReason !== null || isSending || !text.trim()}
          className="button-primary w-full sm:w-auto"
        >
          {isSending ? "Enviando…" : "Enviar para a fila"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
    </form>
  );
}

function AnswerForm({
  questions,
  isUnlocked,
  pendingAnswer,
  onSubmit,
}: {
  questions: string[];
  isUnlocked: boolean;
  pendingAnswer: PromptInputSummary | null;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      setText("");
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet-300 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
        O Claude tem perguntas
      </h3>
      {!isUnlocked ? (
        <p className="text-xs text-zinc-500">Informe a senha dos prompts para ver e responder.</p>
      ) : questions.length === 0 ? (
        <p className="text-xs text-zinc-500">Carregando as perguntas…</p>
      ) : (
        <ol className="list-decimal pl-5 text-sm">
          {questions.map((question, index) => (
            <li key={index} className="whitespace-pre-wrap break-words">
              {question}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        Responda tudo de uma vez, aqui ou no grupo, em até 5 minutos. Vale a primeira resposta.
        Pergunta sem resposta fica a critério do Claude.
      </p>
      {pendingAnswer ? (
        <p className="text-sm text-violet-900 dark:text-violet-200">
          {pendingAnswer.is_mine ? "Você" : pendingAnswer.sender_name} respondeu pelo frontend (
          {INPUT_STATUS_LABELS[pendingAnswer.status]}).
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAXIMUM_TEXT_LENGTH}
            rows={3}
            disabled={!isUnlocked || isSending}
            placeholder={"1. azul\n\n2. na tela inicial"}
            className="input resize-y"
          />
          <button
            type="submit"
            disabled={!isUnlocked || isSending || !text.trim()}
            className="button-primary w-full sm:w-auto sm:self-end"
          >
            {isSending ? "Enviando…" : "Responder"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
