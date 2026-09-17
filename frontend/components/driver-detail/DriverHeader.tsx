import { maskPhone } from "@/lib/logic/format";
import type { Profile } from "@/lib/types";

export interface DriverHeaderProps {
  driver: Profile;
}

/** Driver detail header (PRD Section 8.4). */
export function DriverHeader({ driver }: DriverHeaderProps) {
  return (
    <header className="flex flex-col gap-2 rounded-card border border-line bg-ink-2 p-6">
      <h1 className="font-display text-2xl text-fog">{driver.full_name ?? "Unnamed driver"}</h1>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-mist">
        <div>
          <dt className="inline">Phone: </dt>
          <dd className="inline text-fog">{maskPhone(driver.phone)}</dd>
        </div>
        <div>
          <dt className="inline">Role: </dt>
          <dd className="inline text-fog">{driver.role}</dd>
        </div>
        <div>
          <dt className="inline">Wallet: </dt>
          <dd className="inline text-fog">
            {driver.wallet_address ? "Linked ✓" : "Not linked"}
          </dd>
        </div>
      </dl>
    </header>
  );
}
