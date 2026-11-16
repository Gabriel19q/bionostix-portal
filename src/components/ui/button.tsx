import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn Button, styled after the CI buttons (page 11): bold 14 px, 5 px corners, 1.5 px border.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border-[1.5px] text-sm leading-tight font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground not-disabled:hover:border-brand-700 not-disabled:hover:bg-brand-700 not-disabled:active:bg-brand-800",
        outline:
          "border-primary bg-white text-primary not-disabled:hover:bg-slate-50 not-disabled:active:bg-slate-200 data-[state=open]:bg-slate-50",
        destructive:
          "border-destructive bg-destructive text-white not-disabled:hover:border-danger-hover not-disabled:hover:bg-danger-hover",
        ghost: "border-transparent bg-transparent text-slate-900 not-disabled:hover:bg-slate-50",
        link: "border-transparent bg-transparent px-0 text-primary underline-offset-2 hover:underline",
      },
      size: {
        default: "min-h-11 px-[22px] py-2",
        sm: "min-h-9 px-3 py-1",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
