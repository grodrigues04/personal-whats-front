import type { NextRequest } from "next/server";

import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { listTerminalChunks } from "@/lib/prompt-sessions/repository";
import { PROMPT_ID_PATTERN, SESSION_ID_PATTERN } from "@/lib/prompt-sessions/statuses";

/** Encrypted output of Claude for one prompt, from the chunk after `after` (-1 for all). */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/prompt-sessions/[sessionId]/prompts/[promptId]/terminal">,
): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession();
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const { sessionId, promptId } = await context.params;
  if (!SESSION_ID_PATTERN.test(sessionId) || !PROMPT_ID_PATTERN.test(promptId)) {
    return jsonResponse({ error: "Prompt inválido" }, 400);
  }
  const afterSequence = Number(request.nextUrl.searchParams.get("after") ?? "-1");
  if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) {
    return jsonResponse({ error: "Posição inválida" }, 400);
  }

  try {
    return jsonResponse({ chunks: await listTerminalChunks(sessionId, promptId, afterSequence) });
  } catch (error) {
    console.error(`Failed to read the terminal of prompt ${promptId}`, error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
