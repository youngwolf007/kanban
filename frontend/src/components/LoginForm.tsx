"use client";

import { useState, type FormEvent } from "react";
import { BackgroundGlow } from "@/components/BackgroundGlow";
import { ThemeToggle } from "@/components/ThemeToggle";
import { login, register, type Session } from "@/lib/api";

type LoginFormProps = {
  onSignedIn: (session: Session) => void;
};

export const LoginForm = ({ onSignedIn }: LoginFormProps) => {
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const session =
        mode === "signIn"
          ? await login(username, password)
          : await register(username, password);
      onSignedIn(session);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  const switchMode = (next: "signIn" | "register") => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <BackgroundGlow />

      <main className="relative w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-[var(--surface-strong)]/85 p-10 shadow-[var(--shadow)] backdrop-blur">
        <ThemeToggle className="absolute right-6 top-6" />
        <div className="h-2 w-12 rounded-full bg-[var(--accent-yellow)]" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project Workspace
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {mode === "signIn"
            ? "Sign in to open your boards."
            : "Create an account to start your own boards."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : undefined}
              required
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            {mode === "register" && (
              <p className="mt-1.5 text-xs text-[var(--gray-text)]">
                At least 8 characters.
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              data-testid="login-error"
              className="rounded-xl border border-[var(--accent-yellow)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--navy-dark)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isPending
              ? mode === "signIn"
                ? "Signing in..."
                : "Creating account..."
              : mode === "signIn"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          data-testid="auth-mode-toggle"
          onClick={() => switchMode(mode === "signIn" ? "register" : "signIn")}
          className="mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue-text)] transition hover:opacity-80"
        >
          {mode === "signIn"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>
      </main>
    </div>
  );
};
