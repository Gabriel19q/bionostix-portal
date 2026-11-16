"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Short confirmations ("added to your order"), styled like the CI messages: white with a coloured bar.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      duration={3500}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-md border border-border border-l-4 border-l-primary bg-white px-4 py-3 text-sm text-slate-900 shadow-md",
          success: "border-l-success",
          error: "border-l-danger",
          title: "font-bold",
          description: "text-slate-600",
          icon: "mt-0.5",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
