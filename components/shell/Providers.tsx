"use client";

import * as React from "react";
import { QuoteProvider } from "@/components/quote/QuoteProvider";
import { ToastProvider } from "@/components/shell/toast";
import { TooltipProvider } from "@/components/ui/overlays";

/** Client providers every signed-in screen needs: tooltips, toasts and the quote dialog. */
export function Providers({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <ToastProvider demo={demo}>
        <QuoteProvider>{children}</QuoteProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
