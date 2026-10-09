"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

const Ctx = React.createContext<{ push: (text: string, tone?: Toast["tone"]) => void; demoEdit: () => void }>({ push: () => undefined, demoEdit: () => undefined });

/** Shows short messages at the bottom of the screen. */
export function ToastProvider({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const seq = React.useRef(0);
  const warned = React.useRef(false);
  const push = React.useCallback((text: string, tone: Toast["tone"] = "info") => {
    seq.current += 1;
    const id = seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 5000);
  }, []);
  const demoEdit = React.useCallback(() => {
    if (!demo || warned.current) return;
    warned.current = true;
    push("Demo data. Edits live in memory and reset when the server restarts.");
  }, [demo, push]);
  const value = React.useMemo(() => ({ push, demoEdit }), [push, demoEdit]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-16 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-5 md:items-start md:pl-[calc(224px+24px)]">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto flex max-w-md items-start gap-3 rounded-overlay border bg-raised px-3 py-2 text-[13px] shadow-[var(--shadow)] animate-rise-in", t.tone === "error" ? "border-neg/50" : "border-rule")}>
            <span className={t.tone === "error" ? "text-neg" : ""}>{t.text}</span>
            <button type="button" aria-label="Dismiss" className="-mr-1 text-muted hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => React.useContext(Ctx);
