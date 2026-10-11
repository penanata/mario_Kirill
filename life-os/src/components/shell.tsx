"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Lightbulb, Menu, SunMedium, Target } from "lucide-react";
import { Assistant } from "@/components/assistant";

const main = [
  { href: "/", label: "Сегодня" },
  { href: "/calendar", label: "Календарь" },
  { href: "/tasks", label: "Задачи" },
  { href: "/goals", label: "Цели" },
  { href: "/habits", label: "Привычки" },
  { href: "/ideas", label: "Идеи" },
  { href: "/reflection", label: "Рефлексия" },
  { href: "/opportunities", label: "Возможности" },
  { href: "/insights", label: "Аналитика" },
  { href: "/settings", label: "Настройки" },
];

const tabs = [
  { href: "/", label: "Сегодня", icon: SunMedium },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/goals", label: "Цели", icon: Target },
  { href: "/ideas", label: "Идеи", icon: Lightbulb },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  if (pathname === "/login") return <>{children}</>;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <div className="app-shell md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 px-4 py-6 md:flex">
        <Link href="/" className="px-2 no-underline">
          <div className="font-display text-3xl leading-none">Life</div>
          <div className="mt-1 text-xs tracking-[0.18em] text-[var(--muted)]">OS</div>
        </Link>
        <nav className="flex flex-col gap-1">
          {main.map((item) => (
            <Link key={item.href} href={item.href} data-active={active(item.href)} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
      <nav className="tabbar md:hidden" aria-label="Разделы">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} data-active={active(item.href)}>
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-[var(--muted)]">
          <Menu size={18} />
          Ещё
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMore(false)}>
          <div className="card absolute inset-x-3 bottom-24 p-3" onClick={(event) => event.stopPropagation()}>
            {main.filter((item) => !tabs.some((tab) => tab.href === item.href)).map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMore(false)} className="nav-link">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <Assistant />
    </div>
  );
}
