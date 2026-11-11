import "server-only";

import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  signSession,
  verifySession,
  type Session,
} from "./session";

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  // The expiration check reads the current time, so it never runs while prerendering
  await connection();
  return verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value, process.env.AUTH_SECRET);
}

/** For pages and server actions: sends the user to the login page without a valid session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function startSession(username: string): Promise<void> {
  const token = await signSession(username, process.env.AUTH_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
