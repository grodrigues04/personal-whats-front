import { describe, expect, it } from "vitest";

import { verifyCredentials } from "@/lib/auth/credentials";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_DURATION_SECONDS, signSession, verifySession } from "@/lib/auth/session";

const SECRET = "a".repeat(32);
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

describe("credentials", () => {
  it("needs both the username and the password", async () => {
    const storedHash = await hashPassword("senha");
    expect(await verifyCredentials("gustavo", "senha", "gustavo", storedHash)).toBe(true);
    expect(await verifyCredentials("outro", "senha", "gustavo", storedHash)).toBe(false);
    expect(await verifyCredentials("gustavo", "errada", "gustavo", storedHash)).toBe(false);
  });

  it("fails when not configured", async () => {
    await expect(verifyCredentials("gustavo", "senha", undefined, undefined)).rejects.toThrow();
  });
});

describe("session", () => {
  it("signs and verifies a session", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const token = await signSession("gustavo", SECRET, now);
    const session = await verifySession(token, SECRET, now);
    expect(session?.username).toBe("gustavo");
    expect(session?.expiresAt.getTime()).toBe(now.getTime() + SESSION_DURATION_SECONDS * 1000);
  });

  it("rejects an expired session", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const token = await signSession("gustavo", SECRET, now);
    const afterExpiration = new Date(now.getTime() + (SESSION_DURATION_SECONDS + 1) * 1000);
    expect(await verifySession(token, SECRET, afterExpiration)).toBeNull();
  });

  it("rejects a token signed with another secret or tampered", async () => {
    const token = await signSession("gustavo", SECRET);
    expect(await verifySession(token, OTHER_SECRET)).toBeNull();
    const [header, payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: "outro" }),
    ).toString("base64url");
    expect(await verifySession(`${header}.${tamperedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects missing tokens and short secrets", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
    await expect(signSession("gustavo", "short")).rejects.toThrow();
  });
});
