"use client";

import { useEffect, useState } from "react";
import { getSession, logout, type Session } from "@/lib/api";
import { LoginForm } from "@/components/LoginForm";
import { Workspace } from "@/components/Workspace";

export const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setIsChecking(false));
  }, []);

  const handleSignOut = async () => {
    // Clear the local session either way. If the request failed there is nothing the
    // user can do about it here, and leaving them on the board looks like a dead button.
    await logout().catch(() => {});
    setSession(null);
  };

  if (isChecking) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]"
      >
        Loading
      </div>
    );
  }

  if (!session) {
    return <LoginForm onSignedIn={setSession} />;
  }

  return (
    <Workspace
      userId={session.id}
      username={session.username}
      onSignOut={handleSignOut}
    />
  );
};
