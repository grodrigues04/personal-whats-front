import type { NextRequest } from "next/server";

import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { listMessages } from "@/lib/messages/repository";
import {
  SOURCE_PATTERN,
  VIEW_STATUSES,
  type MessageStatus,
  type MessageView,
} from "@/lib/messages/statuses";

const MAXIMUM_PAGE = 10_000;

export async function GET(request: NextRequest): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession({ adminOnly: true });
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const searchParams = request.nextUrl.searchParams;
  const view = searchParams.get("view") ?? "queue";
  if (!(view in VIEW_STATUSES)) {
    return jsonResponse({ error: "Visão inválida" }, 400);
  }
  const viewStatuses: readonly string[] = VIEW_STATUSES[view as MessageView];

  const status = searchParams.get("status") || undefined;
  if (status && !viewStatuses.includes(status)) {
    return jsonResponse({ error: "Status inválido para esta visão" }, 400);
  }
  const source = searchParams.get("source") || undefined;
  if (source && !SOURCE_PATTERN.test(source)) {
    return jsonResponse({ error: "Origem inválida" }, 400);
  }
  const page = Number(searchParams.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > MAXIMUM_PAGE) {
    return jsonResponse({ error: "Página inválida" }, 400);
  }

  try {
    const messagePage = await listMessages({
      view: view as MessageView,
      status: status as MessageStatus | undefined,
      source,
      page,
    });
    return jsonResponse(messagePage);
  } catch (error) {
    console.error("Failed to list messages", error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
