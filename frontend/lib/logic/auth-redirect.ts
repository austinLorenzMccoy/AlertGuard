import type { Role } from "@/lib/types";

/**
 * Role-based post-login redirect (PRD Section 8.1 / Section 13 step 6):
 * only fleet_manager and admin reach the dashboard; driver is bounced to the
 * app-download page. Any unrecognized role is treated the same as "driver"
 * — fail closed, never let an unknown role fall through to the dashboard.
 */
export function getPostLoginRedirect(role: Role | null | undefined): string {
  if (role === "fleet_manager" || role === "admin") {
    return "/overview";
  }
  return "/download";
}
