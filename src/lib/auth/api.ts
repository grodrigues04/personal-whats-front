import "server-only";

import { getSession } from "./server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Every route handler calls this itself: the proxy is not the only protection. */
export async function unauthorizedResponseIfNoSession(): Promise<Response | null> {
  const session = await getSession();
  return session ? null : jsonResponse({ error: "Não autenticado" }, 401);
}
