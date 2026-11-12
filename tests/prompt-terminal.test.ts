import { describe, expect, it } from "vitest";

import { buildSessionQueue } from "@/lib/prompt-sessions/queue";
import type { PromptSessionSummary, PromptSummary } from "@/lib/prompt-sessions/statuses";
import { buildTerminalEntries, parseTerminalLine, summarizeToolInput } from "@/lib/prompt-sessions/terminal";

describe("terminal", () => {
  it("shows text, thinking and tool calls of Claude", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "vou ler" },
          { type: "text", text: "Vou rodar os testes" },
          { type: "tool_use", name: "Bash", input: { command: "npm test", description: "testes" } },
        ],
      },
    });
    expect(parseTerminalLine(line)).toEqual([
      { kind: "thinking", text: "vou ler" },
      { kind: "text", text: "Vou rodar os testes" },
      {
        kind: "tool",
        name: "Bash",
        summary: "npm test",
        input: JSON.stringify({ command: "npm test", description: "testes" }, null, 2),
      },
    ]);
  });

  it("shows tool results, as text or blocks, and errors", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", content: "ok", is_error: false },
          { type: "tool_result", content: [{ type: "text", text: "falhou" }], is_error: true },
        ],
      },
    });
    expect(parseTerminalLine(line)).toEqual([
      { kind: "tool_result", text: "ok", isError: false },
      { kind: "tool_result", text: "falhou", isError: true },
    ]);
  });

  it("shows the start, the result, truncated lines and lines that are not JSON", () => {
    expect(parseTerminalLine(JSON.stringify({ type: "system", subtype: "init", model: "opus" }))).toEqual([
      { kind: "info", text: "Claude Code iniciado · modelo opus" },
    ]);
    expect(
      parseTerminalLine(
        JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "feito", duration_ms: 61_400, num_turns: 7 }),
      ),
    ).toEqual([{ kind: "result", isError: false, text: "feito", durationSeconds: 61, turns: 7 }]);
    expect(parseTerminalLine(JSON.stringify({ type: "truncated", original_length: 2_000_000 }))[0].kind).toBe("info");
    expect(parseTerminalLine("aviso solto")).toEqual([{ kind: "raw", text: "aviso solto" }]);
    expect(parseTerminalLine(JSON.stringify({ type: "stream_event" }))).toEqual([]);
  });

  it("summarizes the most useful field of a tool call", () => {
    expect(summarizeToolInput({ file_path: "frontend/src/App.tsx", content: "x" })).toBe("frontend/src/App.tsx");
    expect(summarizeToolInput({ other: 1 })).toBe('{"other":1}');
    expect(summarizeToolInput({ command: "x".repeat(300) })).toHaveLength(160);
  });

  it("adds a header whenever the step changes", () => {
    const text = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "oi" }] } });
    const entries = buildTerminalEntries([
      { step: "review", lines: [text] },
      { step: "implementation", lines: [text] },
      { step: "implementation", lines: [text] },
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(["step", "text", "step", "text", "text"]);
  });
});

function prompt(id: string, status: PromptSummary["status"], receivedAt: string): PromptSummary {
  return { id, status, source: "whatsapp", received_at: receivedAt, started_at: null, finished_at: null };
}

describe("queue", () => {
  it("puts the running prompt first and counts it in the queue", () => {
    const session = {
      prompt_limit: 5,
      prompts: [
        prompt("done", "done", "2026-11-12T10:00:00Z"),
        prompt("late", "queued", "2026-11-12T10:03:00Z"),
        prompt("running", "waiting_answers", "2026-11-12T10:01:00Z"),
        prompt("early", "queued", "2026-11-12T10:02:00Z"),
      ],
    } as PromptSessionSummary;
    const queue = buildSessionQueue(session);
    expect(queue.current?.id).toBe("running");
    expect(queue.waiting.map((item) => item.id)).toEqual(["early", "late"]);
    expect(queue.finished.map((item) => item.id)).toEqual(["done"]);
    expect([queue.total, queue.usedCount, queue.isLimitReached]).toEqual([3, 4, false]);
    expect(buildSessionQueue({ ...session, prompt_limit: 4 }).isLimitReached).toBe(true);
    expect(buildSessionQueue({ ...session, prompt_limit: null }).isLimitReached).toBe(false);
  });
});
