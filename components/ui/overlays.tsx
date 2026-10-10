"use client";

import * as React from "react";
import { Dialog as D, Popover as P, Tooltip as T, DropdownMenu as M } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const overlay = "fixed inset-0 z-50 bg-[#0b2e22]/30 dark:bg-black/55 data-[state=open]:animate-fade-in";
const surface = "border border-rule bg-raised text-ink shadow-[var(--shadow)]";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Centred dialog on desktop, bottom sheet on phones. */
export function DialogContent({ className, children, title, description, hideClose, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string; hideClose?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          surface,
          "fixed z-50 flex max-h-[88dvh] w-full flex-col overflow-hidden data-[state=open]:animate-rise-in",
          "bottom-0 left-0 rounded-t-[12px] md:bottom-auto md:left-1/2 md:top-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-overlay",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
          <div className="min-w-0">
            <D.Title className="text-[14px] font-semibold leading-5">{title}</D.Title>
            {description ? <D.Description className="caption mt-0.5">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          {hideClose ? null : (
            <D.Close className="-mr-1.5 -mt-0.5 inline-flex size-7 items-center justify-center rounded-ctl text-muted hover:bg-hover hover:text-ink" aria-label="Close">
              <X className="size-4" strokeWidth={1.5} />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export const Drawer = D.Root;
export const DrawerTrigger = D.Trigger;

/** Navigation drawer that slides in from the left, below 1024px. Radix traps focus, closes on Escape and returns focus to the button that opened it. */
export function DrawerContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className={cn(overlay, "lg:hidden")} />
      <D.Content className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)] shadow-[var(--shadow)] data-[state=open]:animate-drawer-in lg:hidden", className)} {...props}>
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">{description ?? title}</D.Description>
        <D.Close className="absolute right-2 top-2 inline-flex size-10 items-center justify-center rounded-ctl text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-[var(--sidebar-fg)] focus-visible:outline-[#7fe0b8]" aria-label="Close menu">
          <X className="size-5" strokeWidth={1.5} />
        </D.Close>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

/** Panel that slides in from the right, full width on phones. */
export function SheetContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content className={cn(surface, "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-y-0 border-r-0 data-[state=open]:animate-sheet-in sm:w-[480px]", className)} {...props}>
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
          <div className="min-w-0">
            <D.Title className="text-[14px] font-semibold leading-5">{title}</D.Title>
            {description ? <D.Description className="caption mt-0.5">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mr-1.5 -mt-0.5 inline-flex size-7 items-center justify-center rounded-ctl text-muted hover:bg-hover hover:text-ink" aria-label="Close">
            <X className="size-4" strokeWidth={1.5} />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;
export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset} collisionPadding={12} className={cn(surface, "z-50 w-72 rounded-overlay p-3 data-[state=open]:animate-fade-in", className)} {...props} />
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;
/** Short hint on hover and keyboard focus. */
export function Tip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} collisionPadding={8} className={cn(surface, "z-[60] max-w-64 rounded-ctl px-2 py-1 text-[12px] leading-4 data-[state=delayed-open]:animate-fade-in")}>
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export function MenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} collisionPadding={8} className={cn(surface, "z-50 min-w-44 rounded-overlay p-1 data-[state=open]:animate-fade-in", className)} {...props} />
    </M.Portal>
  );
}
export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("flex h-8 cursor-pointer select-none items-center gap-2 rounded-[4px] px-2 text-[13px] outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:text-muted", className)} {...props} />;
}
export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("caption px-2 py-1.5", className)} {...props} />;
}
export const MenuSeparator = () => <M.Separator className="-mx-1 my-1 h-px bg-rule" />;
