"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white dark:text-[#10211e]",
        quiet: "bg-transparent text-[var(--ink)] hover:bg-[var(--accent-soft)]",
        outline: "border border-[var(--line)] bg-transparent",
        danger: "bg-transparent text-[var(--danger)]",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-[13px]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, asChild, type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={asChild ? undefined : type ?? "button"} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warn" | "demo" }) {
  const tones = {
    neutral: "bg-black/5 text-[var(--muted)] dark:bg-white/10",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
    warn: "bg-orange-100 text-[var(--warn)] dark:bg-orange-950",
    demo: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] tracking-wide", tones[tone])}>{children}</span>;
}

export function Progress({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10" aria-valuenow={value ?? undefined} role="progressbar">
      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round((value ?? 0) * 100)}%`, opacity: value === null ? 0.25 : 1 }} />
    </div>
  );
}

export function Modal({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="card fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[min(560px,calc(100%-24px))] -translate-x-1/2 overflow-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <Dialog.Title className="font-display text-2xl">{title}</Dialog.Title>
            <Dialog.Close className="rounded-full p-2" aria-label="Закрыть"><X size={18} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DemoMark({ on }: { on?: boolean }) {
  if (!on) return null;
  return <Badge tone="demo">демо</Badge>;
}
