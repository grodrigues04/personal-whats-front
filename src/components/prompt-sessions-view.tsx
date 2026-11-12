"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { countDaysLeft, describeRetention } from "@/lib/prompt-sessions/retention";
import type {
  PromptSessionPage,
  PromptSessionSummary,
  PromptStatus,
  PromptSummary,
} from "@/lib/prompt-sessions/statuses";

import { ActiveSessionPanel } from "./active-session-panel";
import { DecryptedPrompt } from "./decrypted-prompt";
import { useDecryption, type PromptDecryptionResult } from "./decryption-provider";
import { PromptSessionStatusBadge, PromptStatusBadge } from "./prompt-status-badges";
import { PromptTerminal } from "./prompt-terminal";

const REFRESH_INTERVAL_MILLISECONDS = 15_000;
// While a session runs, its queue and the questions of Claude need to show up fast
const ACTIVE_REFRESH_INTERVAL_MILLISECONDS = 4_000;
const LIVE_SESSION_STATUSES = ["active", "finishing"];
const LIVE_PROMPT_STATUSES = ["reviewing", "running", "waiting_answers"];

export function PromptSessionsView() {
  const [page, setPage] = useState(1);
  const [sessionPage, setSessionPage] = useState<PromptSessionPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [refreshCount, setRefreshCount] = useState(0);
  const { isUnlocked, decryptSession } = useDecryption();
  const isPromptsUnlocked = isUnlocked("prompts");
  const activeSession =
    sessionPage?.sessions.find((session) => LIVE_SESSION_STATUSES.includes(session.status)) ?? null;
  const refreshInterval = activeSession
    ? ACTIVE_REFRESH_INTERVAL_MILLISECONDS
    : REFRESH_INTERVAL_MILLISECONDS;
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  // The session running now is decrypted on every refresh: its queue and questions stay current
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionVersion = activeSession
    ? activeSession.prompts.map((prompt) => `${prompt.id}:${prompt.status}`).join(",")
    : "";
  useEffect(() => {
    if (activeSessionId && isPromptsUnlocked) {
      decryptSession(activeSessionId, { silent: true });
    }
  }, [activeSessionId, activeSessionVersion, isPromptsUnlocked, decryptSession, lastUpdate]);

  useEffect(() => {
    const controller = new AbortController();
    const searchParams = new URLSearchParams({ page: String(page) });
    const load = () =>
      fetchJson<PromptSessionPage>(`/api/prompt-sessions?${searchParams}`, controller.signal)
        .then((result) => {
          setSessionPage(result);
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
    }, refreshInterval);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [page, refreshCount, refreshInterval]);

  const totalPages = sessionPage
    ? Math.max(1, Math.ceil(sessionPage.total / sessionPage.page_size))
    : 1;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prompts</h1>
          <p className="text-xs text-zinc-500">
            {sessionPage ? `${sessionPage.total} sessões` : "…"} · atualiza a cada{" "}
            {refreshInterval / 1000}s
            {lastUpdate && ` · última atualização ${formatDate(lastUpdate)}`}
          </p>
        </div>
        <button
          type="button"
          className="button-secondary w-full sm:w-auto"
          onClick={refresh}
        >
          Atualizar
        </button>
      </div>

      {activeSession && <ActiveSessionPanel session={activeSession} onSent={refresh} />}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {isLoading && !sessionPage ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : sessionPage && sessionPage.sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nenhuma sessão de prompts.
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {sessionPage?.sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </ul>
      )}

      {sessionPage && sessionPage.total > sessionPage.page_size && (
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

const FINAL_STATUS_SUMMARY: { status: PromptStatus; singular: string; plural: string }[] = [
  { status: "done", singular: "concluído", plural: "concluídos" },
  { status: "failed", singular: "falhou", plural: "falharam" },
  { status: "rejected", singular: "rejeitado", plural: "rejeitados" },
  { status: "cancelled", singular: "cancelado", plural: "cancelados" },
];
// Few days left: the deletion notice turns amber
const RETENTION_WARNING_DAYS = 2;

function SessionCard({ session }: { session: PromptSessionSummary }) {
  const {
    isUnlocked: isScopeUnlocked,
    decryptedSessions,
    decryptSession,
    hideSession,
  } = useDecryption();
  const isUnlocked = isScopeUnlocked("prompts");
  const decryption = decryptedSessions[session.id];
  const daysLeft = countDaysLeft(session.records_expire_at);
  const statusSummary = FINAL_STATUS_SUMMARY.map(({ status, singular, plural }) => {
    const count = session.prompts.filter((prompt) => prompt.status === status).length;
    return count > 0 ? `${count} ${count === 1 ? singular : plural}` : null;
  }).filter(Boolean);

  return (
    <li className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-4 dark:border-zinc-800 dark:bg-zinc-800/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Sessão de {formatDate(session.started_at)}</h2>
              <PromptSessionStatusBadge status={session.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              <span>{session.chat_name}</span>
              <span>·</span>
              <span className="break-all font-mono">{session.branch}</span>
            </div>
          </div>
          {decryption && decryption.state !== "loading" ? (
            <button
              type="button"
              className="button-secondary w-full sm:w-auto"
              onClick={() => hideSession(session.id)}
            >
              Ocultar
            </button>
          ) : (
            <button
              type="button"
              className="button-secondary w-full sm:w-auto"
              disabled={!isUnlocked || decryption?.state === "loading" || session.prompts.length === 0}
              title={isUnlocked ? undefined : "Informe a senha dos prompts no topo da página"}
              onClick={() => decryptSession(session.id)}
            >
              {decryption?.state === "loading" ? "Descriptografando…" : "Descriptografar"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip>
            {session.prompts.length} prompt{session.prompts.length === 1 ? "" : "s"}
            {session.prompt_limit !== null && ` de ${session.prompt_limit}`}
          </Chip>
          {statusSummary.length > 0 && <Chip>{statusSummary.join(" · ")}</Chip>}
          <Chip
            tone={daysLeft === 0 ? "muted" : daysLeft <= RETENTION_WARNING_DAYS ? "warning" : "default"}
            title={`Dia ${formatDate(session.records_expire_at)}. A sessão e os prompts ficam; somem o terminal e os envios pelo frontend.`}
          >
            {describeRetention(session.records_expire_at)}
          </Chip>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <DateField label="Início" value={session.started_at} />
          <DateField label="Aceita prompts até" value={session.ends_at} />
          <DateField label="Finalizada" value={session.finished_at} />
          <Field label="Duração" value={`${session.duration_minutes} min`} />
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-zinc-500">Pull request</dt>
            <dd className="break-all">
              {session.pull_request_url ? (
                <a
                  href={session.pull_request_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline dark:text-emerald-400"
                >
                  {session.pull_request_url}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        {session.end_reason && (
          <p className="whitespace-pre-wrap break-words rounded-md bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">
            <span className="text-zinc-500">Motivo do fim: </span>
            {session.end_reason}
          </p>
        )}

        {decryption?.state === "error" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {decryption.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Enviado nesta sessão
          </h3>
          {session.prompts.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum prompt.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              {session.prompts.map((prompt, index) => (
                <PromptItem
                  key={prompt.id}
                  number={index + 1}
                  sessionId={session.id}
                  prompt={prompt}
                  decryption={
                    decryption?.state === "decrypted" ? decryption.prompts[prompt.id] : undefined
                  }
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({
  children,
  tone = "default",
  title,
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "muted";
  title?: string;
}) {
  const colors = {
    default: "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    muted: "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800",
  };
  return (
    <span title={title} className={`rounded-full border px-2 py-0.5 ${colors[tone]}`}>
      {children}
    </span>
  );
}

function PromptItem({
  number,
  sessionId,
  prompt,
  decryption,
}: {
  number: number;
  sessionId: string;
  prompt: PromptSummary;
  decryption: PromptDecryptionResult | undefined;
}) {
  const { isUnlocked } = useDecryption();
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const senderName = decryption?.state === "decrypted" ? decryption.content.sender_name : null;
  return (
    <li className="relative flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="absolute -left-[1.4rem] top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
        {number}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <PromptStatusBadge status={prompt.status} />
        {senderName && <span className="text-sm font-medium">{senderName}</span>}
        <span className="text-xs text-zinc-500">
          {prompt.source === "frontend" ? "pelo frontend" : "pelo grupo"}
        </span>
        {prompt.status !== "queued" && (
          <button
            type="button"
            className="button-secondary ml-auto font-mono text-xs"
            disabled={!isUnlocked("prompts")}
            title={isUnlocked("prompts") ? undefined : "Informe a senha dos prompts no topo da página"}
            onClick={() => setIsTerminalOpen((isOpen) => !isOpen)}
          >
            {isTerminalOpen ? "Fechar terminal" : ">_ Terminal"}
          </button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <DateField label="Recebido" value={prompt.received_at} />
        <DateField label="Iniciado" value={prompt.started_at} />
        <DateField label="Finalizado" value={prompt.finished_at} />
      </dl>
      {decryption?.state === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {decryption.error}
        </p>
      )}
      {decryption?.state === "decrypted" && <DecryptedPrompt content={decryption.content} />}
      {isTerminalOpen && (
        <PromptTerminal
          sessionId={sessionId}
          promptId={prompt.id}
          isLive={LIVE_PROMPT_STATUSES.includes(prompt.status)}
        />
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DateField({ label, value }: { label: string; value: string | null }) {
  return <Field label={label} value={formatDate(value)} />;
}
