"use client";

import { useFormStatus } from "react-dom";

// Submit button that is disabled while the form is being saved, so a second click cannot send old values.
export function SubmitButton({
  children, pendingText = "Saving…", className = "btn-primary", formAction,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} formAction={formAction} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
