/** Shared hand-drawn line icons for the marketing landing page (PRD Section 9's icon language). */

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={1.6} className={className}>
      <circle cx="14" cy="14" r="11.5" />
      <path d="M8.5 14.3l3.6 3.6L19.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 8.5l3.2 3.2L13 4.5" />
    </svg>
  );
}
