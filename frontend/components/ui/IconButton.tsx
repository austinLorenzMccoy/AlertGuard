import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required, not optional: icon-only buttons must always carry a label (PRD Section 12). */
  "aria-label": string;
  children: ReactNode;
}

/** Icon-only button: real <button>, 44x44 minimum, always labelled for screen readers. */
export function IconButton({ className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      className={`inline-flex h-touch w-touch items-center justify-center rounded-btn text-fog hover:bg-ink-3 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
