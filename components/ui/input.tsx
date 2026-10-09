import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-ctl border border-rule-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-muted/80 transition-colors duration-100 hover:border-muted/60 focus-visible:border-accent disabled:opacity-50 aria-[invalid=true]:border-neg";

/** Text input, 32 px tall. */
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input className={cn(field, "h-8", className)} {...props} />;
}

/** Multi-line input. */
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24 py-2 leading-5", className)} {...props} />;
}

/** Native select, styled like the inputs. Native keeps the phone picker and the keyboard behaviour. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "h-8 appearance-none bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-7", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378887f' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

/** Label that sits above its field. */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("label block text-ink", className)} {...props} />;
}

/** A label, its field and an optional hint or error, stacked with 6 px gaps. */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="caption text-neg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="caption">{hint}</p>
      ) : null}
    </div>
  );
}
