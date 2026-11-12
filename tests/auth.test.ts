import { describe, expect, it } from "vitest";

import { verifyCredentials } from "@/lib/auth/credentials";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_DURATION_SECONDS, signSession, verifySession } from "@/lib/auth/session";
import { canAccessPath, loadUsers, normalizeUsername, type User } from "@/lib/auth/users";

const SECRET = "a".repeat(32);
const GUSTAVO = { username: "gustavo", name: "Gustavo", role: "admin" as const };
const OTHER_SECRET = "b".repeat(32);

describe("password hash", () => {
  it("verifies the right password only", async () => {
    const storedHash = await hashPassword("senha correta");
    expect(storedHash).toMatch(/^scrypt:\d+:\d+:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("senha correta", storedHash)).toBe(true);
    expect(await verifyPassword("senha errada", storedHash)).toBe(false);
  });

  it("uses a random salt", async () => {
    expect(await hashPassword("mesma senha")).not.toBe(await hashPassword("mesma senha"));
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("senha", "")).toBe(false);
    expect(await verifyPassword("senha", "bcrypt:1:2:3:4:5")).toBe(false);
    expect(await verifyPassword("senha", "scrypt:x:8:1:c2FsdA==:aGFzaA==")).toBe(false);
  });

  it("refuses an empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});

describe("users", () => {
  it("normalizes phone numbers and keeps other usernames", () => {
    expect(normalizeUsername("+55 48 9555-0101")).toBe("4895550101");
    expect(normalizeUsername("48995550101")).toBe("4895550101");
    expect(normalizeUsername("(48) 9 9555-0101")).toBe("4895550101");
    expect(normalizeUsername("5548995550101")).toBe("4895550101");
    expect(normalizeUsername(" gustavo ")).toBe("gustavo");
  });

  it("loads the admin and the users of the Prompts tab", () => {
    const users = loadUsers({
      AUTH_USERNAME: "gustavo",
      AUTH_PASSWORD_HASH: "hash-admin",
      AUTH_PROMPT_USERS: JSON.stringify([
        { username: "+55 48 9555-0101", name: "Arthur", password_hash: "hash-arthur" },
      ]),
    });
    expect(users).toEqual([
      { username: "gustavo", name: "Gustavo", role: "admin", passwordHash: "hash-admin" },
      { username: "4895550101", name: "Arthur", role: "prompts", passwordHash: "hash-arthur" },
    ]);
  });

  it("refuses a missing admin, malformed users and repeated usernames", () => {
    expect(() => loadUsers({})).toThrow();
    const base = { AUTH_USERNAME: "gustavo", AUTH_PASSWORD_HASH: "hash" };
    expect(() => loadUsers({ ...base, AUTH_PROMPT_USERS: "{" })).toThrow();
    expect(() =>
      loadUsers({ ...base, AUTH_PROMPT_USERS: JSON.stringify([{ username: "1", name: "A" }]) }),
    ).toThrow();
    expect(() =>
      loadUsers({
        ...base,
        AUTH_PROMPT_USERS: JSON.stringify([
          { username: "4895550101", name: "A", password_hash: "x" },
          { username: "48995550101", name: "B", password_hash: "y" },
        ]),
      }),
    ).toThrow();
  });

  it("lets the users of the Prompts tab open only the prompts", () => {
    expect(canAccessPath("admin", "/")).toBe(true);
    expect(canAccessPath("prompts", "/prompts")).toBe(true);
    expect(canAccessPath("prompts", "/api/prompt-sessions/abc/inputs")).toBe(true);
    expect(canAccessPath("prompts", "/api/prompt-key-check")).toBe(true);
    expect(canAccessPath("prompts", "/")).toBe(false);
    expect(canAccessPath("prompts", "/historico")).toBe(false);
    expect(canAccessPath("prompts", "/api/messages")).toBe(false);
    expect(canAccessPath("prompts", "/api/key-check")).toBe(false);
  });
});

describe("credentials", () => {
  it("needs both the username and the password", async () => {
    const users: User[] = [
      { ...GUSTAVO, passwordHash: await hashPassword("senha") },
      {
        username: "4895550101",
        name: "Arthur",
        role: "prompts",
        passwordHash: await hashPassword("outra"),
      },
    ];
    expect((await verifyCredentials("gustavo", "senha", users))?.name).toBe("Gustavo");
    expect((await verifyCredentials("+55 48 99555-0101", "outra", users))?.role).toBe("prompts");
    expect(await verifyCredentials("outro", "senha", users)).toBeNull();
    expect(await verifyCredentials("gustavo", "errada", users)).toBeNull();
    expect(await verifyCredentials("4895550101", "senha", users)).toBeNull();
  });
});

describe("session", () => {
  it("signs and verifies a session", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const token = await signSession(GUSTAVO, SECRET, now);
    const session = await verifySession(token, SECRET, now);
    expect(session?.username).toBe("gustavo");
    expect(session?.name).toBe("Gustavo");
    expect(session?.role).toBe("admin");
    expect(session?.expiresAt.getTime()).toBe(now.getTime() + SESSION_DURATION_SECONDS * 1000);
  });

  it("rejects an expired session", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const token = await signSession(GUSTAVO, SECRET, now);
    const afterExpiration = new Date(now.getTime() + (SESSION_DURATION_SECONDS + 1) * 1000);
    expect(await verifySession(token, SECRET, afterExpiration)).toBeNull();
  });

  it("rejects a token signed with another secret or tampered", async () => {
    const token = await signSession(GUSTAVO, SECRET);
    expect(await verifySession(token, OTHER_SECRET)).toBeNull();
    const [header, payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: "outro" }),
    ).toString("base64url");
    expect(await verifySession(`${header}.${tamperedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects a token without role, from before the users of the Prompts tab", async () => {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("gustavo")
      .setIssuer("personal-whats-front")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejects missing tokens and short secrets", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
    await expect(signSession(GUSTAVO, "short")).rejects.toThrow();
  });
});
