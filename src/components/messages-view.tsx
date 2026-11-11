"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
  STATUS_LABELS,
  VIEW_STATUSES,
  type MessagePage,
  type MessageSummary,
  type MessageView,
} from "@/lib/messages/statuses";

import { DecryptedMessage } from "./decrypted-message";
import { useDecryption } from "./decryption-provider";
import { StatusBadge } from "./status-badge";

const REFRESH_INTERVAL_MILLISECONDS = 15_000;

type MessagesViewProps = { view: MessageView; title: string };

export function MessagesView({ view, title }: MessagesViewProps) {
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [messagePage, setMessagePage] = useState<MessagePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const searchParams = new URLSearchParams({ view, page: String(page) });
    if (status) {
      searchParams.set("status", status);
    }
    if (source) {
      searchParams.set("source", source);
    }
    const load = () =>
      fetchJson<MessagePage>(`/api/messages?${searchParams}`, controller.signal)
        .then((result) => {
          setMessagePage(result);
          setError(null);
          setLastUpdate(new Date().toISOString());
        })
        .catch((loadError: unknown) => {
          if (!controller.signal.aborted) {
            setError(loadError instanceof Error ? loadError.message : "Erro ao carregar");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });

    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
      }
    }, REFRESH_INTERVAL_MILLISECONDS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [view, page, status, source, refreshCount]);

  const totalPages = messagePage
    ? Math.max(1, Math.ceil(messagePage.total / messagePage.page_size))
    : 1;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-xs text-zinc-500">
            {messagePage ? `${messagePage.total} mensagens` : "…"} · atualiza a cada 15s
            {lastUpdate && ` · última atualização ${formatDate(lastUpdate)}`}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="input"
            >
              <option value="">Todos</option>
              {VIEW_STATUSES[view].map((viewStatus) => (
                <option key={viewStatus} value={viewStatus}>
                  {STATUS_LABELS[viewStatus]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Origem
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setPage(1);
              }}
              className="input"
            >
              <option value="">Todas</option>
              {messagePage?.sources.map((messageSource) => (
                <option key={messageSource} value={messageSource}>
                  {messageSource}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-secondary col-span-2"
            onClick={() => setRefreshCount((count) => count + 1)}
          >
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {isLoading && !messagePage ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : messagePage && messagePage.messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nenhuma mensagem.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messagePage?.messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </ul>
      )}

      {messagePage && messagePage.total > messagePage.page_size && (
        <nav className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            className="button-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            className="button-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
    </section>
  );
}

function MessageCard({ message }: { message: MessageSummary }) {
  const { isUnlocked, decryptedMessages, decryptMessage, hideMessage } = useDecryption();
  const decryption = decryptedMessages[message.id];

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={message.status} />
          <span className="font-mono text-sm">{message.source}</span>
          <span className="break-all font-mono text-xs text-zinc-400">{message.id}</span>
        </div>
        {decryption && decryption.state !== "loading" ? (
          <button
            type="button"
            className="button-secondary w-full sm:w-auto"
            onClick={() => hideMessage(message.id)}
          >
            Ocultar
          </button>
        ) : (
          <button
            type="button"
            className="button-secondary w-full sm:w-auto"
            disabled={!isUnlocked || decryption?.state === "loading"}
            title={isUnlocked ? undefined : "Informe a senha de criptografia no topo da página"}
            onClick={() => decryptMessage(message.id)}
          >
            {decryption?.state === "loading" ? "Descriptografando…" : "Descriptografar"}
          </button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <DateField label="Criada" value={message.created_at} />
        <DateField label="Atualizada" value={message.updated_at} />
        <DateField label="Enviada" value={message.sent_at} />
        <div>
          <dt className="text-zinc-500">Tentativas</dt>
          <dd>{message.attempts}</dd>
        </div>
        {message.next_attempt_at && message.status !== "sent" && (
          <DateField label="Próxima tentativa" value={message.next_attempt_at} />
        )}
      </dl>

      {message.error && (
        <p className="whitespace-pre-wrap break-words rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {message.error}
        </p>
      )}

      {decryption?.state === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {decryption.error}
        </p>
      )}
      {decryption?.state === "decrypted" && <DecryptedMessage payload={decryption.payload} />}
    </li>
  );
}

function DateField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd>{formatDate(value)}</dd>
    </div>
  );
}
