import * as React from "react";
import { cn } from "@/lib/utils";

/** Title row of a screen: title, one line of context, and the screen's actions on the right. */
export function PageHead({ title, sub, children, className }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 pb-4 pt-5 md:px-6", className)}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="mt-0.5 text-muted">{sub}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** A full-width region with a top rule. Regions are separated by rules and space, not by cards. */
export function Region({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("border-t border-rule bg-surface", className)}>{children}</section>;
}
