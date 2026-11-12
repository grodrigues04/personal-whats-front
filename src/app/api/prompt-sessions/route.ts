import type { NextRequest } from "next/server";

import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { listPromptSessions } from "@/lib/prompt-sessions/repository";

const MAXIMUM_PAGE = 10_000;

export async function GET(request: NextRequest): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession();
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > MAXIMUM_PAGE) {
    return jsonResponse({ error: "Página inválida" }, 400);
  }

  try {
    return jsonResponse(await listPromptSessions(page));
  } catch (error) {
    console.error("Failed to list prompt sessions", error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
