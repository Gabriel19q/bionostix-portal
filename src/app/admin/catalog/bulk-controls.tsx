"use client";

// Ticks or unticks every batch checkbox in the surrounding form
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="offer_id"]').forEach((cb) => {
          cb.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}

// Submit button that asks before doing something that cannot be undone
export function ConfirmButton({ children, message, className, value }: {
  children: React.ReactNode;
  message: string;
  className?: string;
  value: string;
}) {
  return (
    <button
      name="op"
      value={value}
      className={className}
      onClick={(e) => {
        const form = e.currentTarget.form;
        const count = form?.querySelectorAll('input[name="offer_id"]:checked, input[name="offer_id"][type="hidden"]').length ?? 0;
        if (count === 0) return; // the server explains that nothing was selected
        if (!window.confirm(message.replace("{n}", String(count)))) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
