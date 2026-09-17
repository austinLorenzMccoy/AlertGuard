/**
 * Masks all but the last 2 digits of a phone number for the driver detail
 * header (PRD Section 8.4: "phone (masked)"). Returns a placeholder when no
 * phone is on file.
 */
/** Minimal email shape check for the Settings manager-invite form. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "No phone on file";
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly.length <= 2) return "*".repeat(digitsOnly.length);
  const visible = digitsOnly.slice(-2);
  return `${"*".repeat(digitsOnly.length - 2)}${visible}`;
}
