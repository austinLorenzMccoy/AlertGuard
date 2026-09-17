import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { getFleetContext } from "@/lib/auth/fleet-context";

/**
 * Authenticated dashboard shell. Resolves the signed-in fleet manager/admin's
 * context (PRD Section 8.1) and either redirects away or renders the
 * `Sidebar` + page content. `middleware.ts` already gates out fully
 * unauthenticated visitors, but this layout is the source of truth for the
 * role check (needs a `profiles` lookup, which middleware deliberately
 * doesn't do) and is defended here too in case a nested route ever renders
 * without middleware having run first.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const fleetContext = await getFleetContext();

  if (fleetContext.status === "unauthenticated") {
    redirect("/login");
  }

  if (fleetContext.status === "unauthorized_role") {
    redirect("/download");
  }

  if (fleetContext.status === "no_fleet") {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-mist">
            No fleet is assigned to your account yet. Contact your admin to get
            assigned to a fleet.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
