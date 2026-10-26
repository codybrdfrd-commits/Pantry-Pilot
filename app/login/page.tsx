"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      // Only follow same-site paths
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      return;
    }
    setError((await res.json()).error);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 360, margin: "8vh auto 0" }}>
      <div className="page-head">
        <h1>Sign in</h1>
        <p>Enter the app password to open your recipes and groceries.</p>
      </div>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ font: "inherit", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44, background: "var(--card)", color: "var(--ink)" }}
        />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
