"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/LogoMark";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
      </>
    ),
  },
  {
    href: "/drivers",
    label: "Drivers",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5.5 19.5c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6" />
      </>
    ),
  },
  {
    href: "/alerts",
    label: "Live alerts",
    icon: (
      <>
        <path d="M12 4c-2.6 0-4.3 1.9-4.3 4.8v2.6c0 .8-.3 1.6-.9 2.1l-.5.5c-.5.5-.1 1.3.6 1.3h10.2c.7 0 1.1-.8.6-1.3l-.5-.5c-.6-.5-.9-1.3-.9-2.1V8.8C16.3 5.9 14.6 4 12 4z" />
        <path d="M9.9 18.3a2.1 2.1 0 0 0 4.2 0" />
      </>
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: (
      <>
        <path d="M4 20V12.5" />
        <path d="M11 20V6" />
        <path d="M18 20v-5.5" />
        <path d="M3 20h18" />
      </>
    ),
  },
  {
    href: "/redemptions",
    label: "Redemptions",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.2 12.3l2.6 2.6 5-5.4" />
      </>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4.5v2.3M12 17.2v2.3M19.5 12h-2.3M6.8 12H4.5M17.4 6.6l-1.6 1.6M8.2 15.8l-1.6 1.6M17.4 17.4l-1.6-1.6M8.2 8.2L6.6 6.6" />
      </>
    ),
  },
];

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
    >
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </svg>
  );
}

/**
 * Primary dashboard navigation — real <a> elements via next/link (PRD
 * Section 12). Collapsible to an icon-only rail; nav-item labels stay in the
 * DOM as their accessible name (just visually hidden via `sr-only`) so the
 * collapsed state never removes anything screen readers or tests key off.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label="Dashboard navigation"
      className={`flex flex-col gap-1 border-r border-line bg-ink-2 p-4 transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-[72px] items-center px-2" : "w-56"
      }`}
    >
      <div className={`mb-4 flex ${collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2"}`}>
        <Link href="/" className="flex items-center gap-2 text-fog">
          <LogoMark size={24} />
          <span className={collapsed ? "sr-only" : "font-display text-lg"}>AlertGuard</span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-btn border border-line text-mist transition-colors hover:bg-ink-3 hover:text-fog"
        >
          <ChevronIcon collapsed={collapsed} />
        </button>
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`flex min-h-touch items-center gap-3 rounded-btn text-sm font-medium transition-colors ${
              collapsed ? "w-11 justify-center px-0" : "w-full px-3"
            } ${isActive ? "bg-ink-3 text-accent" : "text-mist hover:bg-ink-3 hover:text-fog"}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 shrink-0"
            >
              {item.icon}
            </svg>
            <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
