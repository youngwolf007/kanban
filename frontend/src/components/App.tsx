"use client";

import { useEffect, useState } from "react";
import { getSession, logout, type Session } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

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
    await logout();
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

  return <KanbanBoard username={session.username} onSignOut={handleSignOut} />;
};
