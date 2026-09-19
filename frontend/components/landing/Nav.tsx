import Link from "next/link";
import { LogoMark } from "@/components/landing/icons";

export function Nav() {
  return (
    <nav className="flex h-[88px] items-center justify-between border-b border-line px-6 md:px-16">
      <Link href="/" className="flex items-center gap-2.5 text-fog">
        <LogoMark className="h-7 w-7 text-accent" />
        <span className="font-display text-xl font-semibold tracking-tight">AlertGuard</span>
      </Link>
      <div className="hidden items-center gap-10 font-body text-[15px] text-mist md:flex">
        <a href="#how" className="transition-colors hover:text-fog">
          How it works
        </a>
        <a href="#fleet" className="transition-colors hover:text-fog">
          For fleets
        </a>
        <a href="#rewards" className="transition-colors hover:text-fog">
          Rewards
        </a>
        <Link href="/login" className="transition-colors hover:text-fog">
          Log in
        </Link>
        <Link
          href="/download"
          className="rounded-full bg-fog px-[22px] py-2.5 font-semibold text-ink transition-colors hover:bg-fog/90"
        >
          Get the app
        </Link>
      </div>
    </nav>
  );
}
