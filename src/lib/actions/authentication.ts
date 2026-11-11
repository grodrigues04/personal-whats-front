"use server";

import { redirect } from "next/navigation";

import { verifyCredentials } from "@/lib/auth/credentials";
import { endSession, startSession } from "@/lib/auth/server";

export type LoginState = { error: string | null };

const FAILED_LOGIN_DELAY_MILLISECONDS = 1_000;

export async function login(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { error: "Informe o usuário e a senha" };
  }

  let isValid: boolean;
  try {
    isValid = await verifyCredentials(
      username,
      password,
      process.env.AUTH_USERNAME,
      process.env.AUTH_PASSWORD_HASH,
    );
  } catch (error) {
    console.error("Login is not configured", error);
    return { error: "O login não está configurado no servidor" };
  }
  if (!isValid) {
    // Slows down password guessing
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MILLISECONDS));
    return { error: "Usuário ou senha incorretos" };
  }

  await startSession(username);
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
