import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-ink hover:bg-accent/90",
  secondary: "bg-ink-3 text-fog border border-line hover:bg-ink-3/80",
  danger: "bg-brake text-fog hover:bg-brake/90",
};

/**
 * A real <button> element (PRD Section 12: never a bare tappable div), with
 * a 44px minimum touch target.
 */
export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-btn px-4 text-sm font-medium font-body transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
