"use client";

import * as React from "react";
import { Checkbox as C, Switch as S, Tabs as T } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Checkbox. Pass checked="indeterminate" for a partly selected group. */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root className={cn("relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-rule-strong bg-surface transition-colors duration-100 after:absolute after:-inset-2 data-[state=checked]:border-brand data-[state=indeterminate]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:bg-brand data-[state=checked]:text-brand-fg data-[state=indeterminate]:text-brand-fg", className)} {...props}>
      <C.Indicator>{props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={2.5} />}</C.Indicator>
    </C.Root>
  );
}

/** On and off switch. */
export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full bg-rule-strong transition-colors duration-100 data-[state=checked]:bg-brand", className)} {...props}>
      <S.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-100 data-[state=checked]:translate-x-4 dark:bg-[#e8efea]" />
    </S.Root>
  );
}

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex items-center gap-5 border-b border-rule", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("-mb-px h-9 border-b-2 border-transparent text-[13px] font-medium text-muted transition-colors duration-100 hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink dark:data-[state=active]:border-accent", className)} {...props} />;
}
export const TabsContent = T.Content;

/** Two or more exclusive options shown side by side, such as "Summary / By date". */
export function Segmented<V extends string>({ value, onChange, options, label, className }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-8 items-center rounded-ctl border border-rule-strong bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("h-full rounded-[4px] px-2.5 text-[12px] font-medium text-muted transition-colors duration-100 hover:text-ink", value === o.value && "bg-selected text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small text tag. */
export function Tag({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "accent" | "warn" | "neg" | "ink" }) {
  const tones = { neutral: "border-rule text-muted", accent: "border-accent/40 text-accent-text", warn: "border-warn/50 text-warn", neg: "border-neg/40 text-neg", ink: "border-ink/30 text-ink" };
  return <span className={cn("inline-flex h-[18px] shrink-0 items-center rounded-[4px] border px-1.5 text-[11px] font-medium leading-none", tones[tone], className)} {...props} />;
}

/** Keyboard key. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-rule-strong bg-surface px-1 font-mono text-[11px] leading-none text-muted", className)} {...props} />;
}

/** Placeholder block shown while content loads. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton h-3", className)} aria-hidden {...props} />;
}
