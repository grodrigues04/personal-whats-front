/**
 * Turns the output of Claude Code (`--output-format stream-json --verbose`, one JSON event per
 * line, saved by prompt_automator in prompt_terminal) into the lines of a terminal. Only display:
 * nothing here runs or follows what Claude wrote.
 */
import type { TerminalStep } from "./statuses";

export type TerminalEntry =
  | { kind: "step"; step: TerminalStep }
  | { kind: "info"; text: string }
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; name: string; summary: string; input: string }
  | { kind: "tool_result"; text: string; isError: boolean }
  | { kind: "result"; isError: boolean; text: string; durationSeconds: number | null; turns: number | null }
  | { kind: "raw"; text: string };

export const STEP_LABELS: Record<TerminalStep, string> = {
  review: "Revisão de segurança",
  implementation: "Implementação",
  answers: "Implementação com as respostas",
};

const MAXIMUM_SUMMARY_LENGTH = 160;

// The input field that best describes each tool call, in the order they are tried
const SUMMARY_FIELDS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "url",
  "query",
  "description",
  "prompt",
];

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shorten(text: string, length = MAXIMUM_SUMMARY_LENGTH): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > length ? `${singleLine.slice(0, length - 1)}…` : singleLine;
}

export function summarizeToolInput(input: unknown): string {
  if (!isObject(input)) {
    return "";
  }
  for (const field of SUMMARY_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      return shorten(value);
    }
  }
  return shorten(JSON.stringify(input));
}

/** Text of a tool result: a string, or a list of blocks of which only the text ones are shown. */
function readToolResultContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (isObject(block) && block.type === "text" && typeof block.text === "string") {
          return block.text;
        }
        if (isObject(block) && block.type === "image") {
          return "[imagem]";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return content === undefined || content === null ? "" : JSON.stringify(content);
}

function parseContentBlocks(blocks: unknown): TerminalEntry[] {
  if (typeof blocks === "string") {
    return blocks.trim() ? [{ kind: "text", text: blocks }] : [];
  }
  if (!Array.isArray(blocks)) {
    return [];
  }
  const entries: TerminalEntry[] = [];
  for (const block of blocks) {
    if (!isObject(block)) {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      entries.push({ kind: "text", text: block.text });
    } else if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
      entries.push({ kind: "thinking", text: block.thinking });
    } else if (block.type === "tool_use") {
      entries.push({
        kind: "tool",
        name: typeof block.name === "string" ? block.name : "ferramenta",
        summary: summarizeToolInput(block.input),
        input: JSON.stringify(block.input ?? {}, null, 2),
      });
    } else if (block.type === "tool_result") {
      entries.push({
        kind: "tool_result",
        text: readToolResultContent(block.content),
        isError: block.is_error === true,
      });
    }
  }
  return entries;
}

export function parseTerminalLine(line: string): TerminalEntry[] {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return line.trim() ? [{ kind: "raw", text: line }] : [];
  }
  if (!isObject(event)) {
    return [{ kind: "raw", text: line }];
  }

  switch (event.type) {
    case "system": {
      if (event.subtype === "init") {
        const model = typeof event.model === "string" ? ` · modelo ${event.model}` : "";
        return [{ kind: "info", text: `Claude Code iniciado${model}` }];
      }
      return [];
    }
    case "assistant":
    case "user": {
      const message = isObject(event.message) ? event.message : {};
      return parseContentBlocks(message.content);
    }
    case "result": {
      const isError = event.is_error === true || event.subtype !== "success";
      return [
        {
          kind: "result",
          isError,
          text:
            typeof event.result === "string"
              ? event.result
              : typeof event.subtype === "string"
                ? event.subtype
                : "",
          durationSeconds:
            typeof event.duration_ms === "number" ? Math.round(event.duration_ms / 1000) : null,
          turns: typeof event.num_turns === "number" ? event.num_turns : null,
        },
      ];
    }
    case "truncated": {
      const length = typeof event.original_length === "number" ? event.original_length : 0;
      return [
        {
          kind: "info",
          text: `[saída de ${length.toLocaleString("pt-BR")} caracteres omitida por ser grande demais]`,
        },
      ];
    }
    default:
      // stream_event, rate_limit_event and other events add nothing to the terminal
      return [];
  }
}

/** Lines of one chunk, with a step header whenever the step changes. */
export function buildTerminalEntries(
  chunks: { step: TerminalStep; lines: string[] }[],
): TerminalEntry[] {
  const entries: TerminalEntry[] = [];
  let currentStep: TerminalStep | null = null;
  for (const chunk of chunks) {
    if (chunk.step !== currentStep) {
      entries.push({ kind: "step", step: chunk.step });
      currentStep = chunk.step;
    }
    for (const line of chunk.lines) {
      entries.push(...parseTerminalLine(line));
    }
  }
  return entries;
}
