import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";
import { canAccessPath } from "@/lib/auth/users";

/**
 * First barrier only: pages and route handlers check the session again on the server before
 * reading any data.
 */
const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    process.env.AUTH_SECRET,
  );

  if (PUBLIC_PATHS.includes(pathname)) {
    // Only GET: the login server action also posts to /login
    return session && request.method === "GET"
      ? NextResponse.redirect(new URL(session.role === "admin" ? "/" : "/prompts", request.url))
      : NextResponse.next();
  }
  if (session && canAccessPath(session.role, pathname)) {
    return NextResponse.next();
  }
  if (session) {
    // Users of the Prompts tab never see the WhatsApp messages
    return pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Sem permissão" },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        )
      : NextResponse.redirect(new URL("/prompts", request.url));
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
