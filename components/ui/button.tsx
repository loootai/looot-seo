import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-medium transition-[background-color,border-color,color,transform] duration-100 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-fg hover:bg-brand-hover",
        secondary: "border border-rule-strong bg-surface text-ink hover:bg-hover",
        ghost: "text-ink hover:bg-hover",
        danger: "border border-neg/40 bg-surface text-neg hover:bg-neg/10",
        link: "text-accent-text underline-offset-2 hover:underline",
      },
      size: { sm: "h-7 px-2.5 text-[12px]", md: "h-8 px-3 text-[13px]", lg: "h-10 px-4 text-[13px]", icon: "size-8", iconSm: "size-7" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/** Button with the app's four looks. Use asChild to style a link the same way. */
export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type: type ?? "button" })} {...props} />;
}

export { buttonVariants };
