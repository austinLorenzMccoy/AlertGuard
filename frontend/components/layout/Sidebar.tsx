"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/drivers", label: "Drivers" },
  { href: "/alerts", label: "Live alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/redemptions", label: "Redemptions" },
  { href: "/settings", label: "Settings" },
];

/** Primary dashboard navigation — real <a> elements via next/link (PRD Section 12). */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard navigation" className="flex w-56 flex-col gap-1 border-r border-line bg-ink-2 p-4">
      <span className="mb-4 font-display text-lg text-fog">AlertGuard</span>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-touch items-center rounded-btn px-3 text-sm font-medium transition-colors ${
              isActive ? "bg-ink-3 text-accent" : "text-mist hover:bg-ink-3 hover:text-fog"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
