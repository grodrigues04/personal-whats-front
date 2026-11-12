import "server-only";

import { getSession } from "./server";
import type { Session } from "./session";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * Every route handler calls this itself: the proxy is not the only protection. `adminOnly` routes
 * (WhatsApp messages) answer 403 to the users of the Prompts tab.
 */
export async function unauthorizedResponseIfNoSession(
  { adminOnly = false }: { adminOnly?: boolean } = {},
): Promise<Response | null> {
  const result = await authenticate({ adminOnly });
  return "response" in result ? result.response : null;
}

/** For route handlers that need to know who is logged in. */
export async function authenticate(
  { adminOnly = false }: { adminOnly?: boolean } = {},
): Promise<{ session: Session } | { response: Response }> {
  const session = await getSession();
  if (!session) {
    return { response: jsonResponse({ error: "Não autenticado" }, 401) };
  }
  if (adminOnly && session.role !== "admin") {
    return { response: jsonResponse({ error: "Sem permissão" }, 403) };
  }
  return { session };
}
