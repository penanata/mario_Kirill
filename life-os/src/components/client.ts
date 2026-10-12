export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  if (response.headers.get("content-type")?.includes("text/calendar")) return response as unknown as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не получилось сохранить");
  return data as T;
}
