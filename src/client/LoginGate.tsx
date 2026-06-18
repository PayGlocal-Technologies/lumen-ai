"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@payglocal_ui/flux-ui";
import { Icon } from "./icon.js";
import type { AgentAuthStatus } from "../types/index.js";

export function LoginGate({
  children,
  forceLoggedOut,
  onLoginSuccess,
  apiBasePath = "/api/lumen",
}: {
  children: (status: AgentAuthStatus) => React.ReactNode;
  forceLoggedOut?: boolean;
  onLoginSuccess?: () => void;
  apiBasePath?: string;
}) {
  const [status, setStatus] = useState<AgentAuthStatus | null>(null);
  const [waiting, setWaiting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${apiBasePath}/auth`, { cache: "no-store" });
      setStatus(res.ok ? ((await res.json()) as AgentAuthStatus) : { loggedIn: false });
    } catch {
      setStatus({ loggedIn: false });
    }
  }, [apiBasePath]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!waiting || status?.loggedIn) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [waiting, status?.loggedIn, refresh]);

  useEffect(() => {
    if (status?.loggedIn && forceLoggedOut) onLoginSuccess?.();
  }, [status?.loggedIn, forceLoggedOut, onLoginSuccess]);

  const login = useCallback(async () => {
    setWaiting(true);
    await fetch(`${apiBasePath}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login" }),
    });
  }, [apiBasePath]);

  if (!forceLoggedOut && status?.loggedIn) return <>{children(status)}</>;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon name="sparkles" className="h-7 w-7 text-primary" />
      <p className="text-sm font-medium">Log in to start designing</p>
      <p className="text-xs text-muted-foreground">
        Uses your own Claude account — no API key needed.
      </p>
      <Button
        size="sm"
        onClick={login}
        disabled={waiting}
        leftIcon={<Icon name={waiting ? "loader" : "log-in"} className={waiting ? "animate-spin" : ""} />}
      >
        {waiting ? "Waiting for login…" : "Log in with Claude"}
      </Button>
      {waiting && (
        <p className="text-[11px] text-muted-foreground">
          Complete the login in the Terminal window that just opened.
        </p>
      )}
    </div>
  );
}
