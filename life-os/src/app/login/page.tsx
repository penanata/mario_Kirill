"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="page max-w-md">
      <h1 className="font-display text-5xl">Life OS</h1>
      <p className="my-3 text-sm text-[var(--muted)]">Вход нужен, только если на сервере задан пароль.</p>
      <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" />
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      <Button className="mt-3" onClick={() => void api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }).then(() => router.push("/")).catch((reason) => setError(reason.message))}>Войти</Button>
    </main>
  );
}
