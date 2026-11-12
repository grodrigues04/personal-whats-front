import { describe, expect, it } from "vitest";

import { validateInput, type SessionStateForInput } from "@/lib/prompt-sessions/inputs";

const PROMPT_ID = "a".repeat(32);
const NONCE = Buffer.alloc(12, 1).toString("base64");
const CIPHERTEXT = Buffer.alloc(40, 2).toString("base64");
const ACTIVE: SessionStateForInput = {
  status: "active",
  prompts: [{ id: PROMPT_ID, status: "waiting_answers" }],
};

function body(overrides: Record<string, unknown> = {}) {
  return { kind: "prompt", encryption_version: 1, nonce: NONCE, ciphertext: CIPHERTEXT, ...overrides };
}

describe("inputs sent through the frontend", () => {
  it("accepts a prompt only while the session accepts prompts", () => {
    expect(validateInput(body(), ACTIVE)).toMatchObject({ input: { kind: "prompt", promptId: null } });
    expect(validateInput(body(), { ...ACTIVE, status: "finishing" })).toEqual({
      error: "A sessão não aceita mais prompts",
    });
  });

  it("accepts an answer only for a prompt waiting answers", () => {
    expect(validateInput(body({ kind: "answer", prompt_id: PROMPT_ID }), ACTIVE)).toMatchObject({
      input: { kind: "answer", promptId: PROMPT_ID },
    });
    expect(
      validateInput(body({ kind: "answer", prompt_id: PROMPT_ID }), {
        status: "finishing",
        prompts: [{ id: PROMPT_ID, status: "waiting_answers" }],
      }),
    ).toMatchObject({ input: { kind: "answer" } });
    expect(
      validateInput(body({ kind: "answer", prompt_id: PROMPT_ID }), {
        ...ACTIVE,
        prompts: [{ id: PROMPT_ID, status: "running" }],
      }),
    ).toEqual({ error: "Este prompt não está esperando respostas" });
    expect(validateInput(body({ kind: "answer", prompt_id: "../x" }), ACTIVE)).toEqual({
      error: "Prompt inválido",
    });
  });

  it("refuses malformed encrypted content", () => {
    expect("error" in validateInput(body({ kind: "outro" }), ACTIVE)).toBe(true);
    expect("error" in validateInput(body({ encryption_version: 2 }), ACTIVE)).toBe(true);
    expect("error" in validateInput(body({ nonce: Buffer.alloc(8).toString("base64") }), ACTIVE)).toBe(true);
    expect("error" in validateInput(body({ ciphertext: "não é base64" }), ACTIVE)).toBe(true);
    expect(
      "error" in validateInput(body({ ciphertext: Buffer.alloc(70_000).toString("base64") }), ACTIVE),
    ).toBe(true);
    expect("error" in validateInput(null, ACTIVE)).toBe(true);
  });
});
