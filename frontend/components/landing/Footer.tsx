import { LogoMark } from "@/components/brand/LogoMark";

export function Footer() {
  return (
    <footer className="flex flex-col gap-10 border-t border-line px-6 py-11 md:flex-row md:items-start md:justify-between md:px-16">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="font-display text-[17px] font-semibold text-fog">AlertGuard</span>
        </div>
        <p className="max-w-[280px] font-body text-[13px] text-mist">
          Verified-safe-driving detection, built for the roads and phones people actually use.
        </p>
      </div>
      <div className="flex gap-16 font-body text-[13.5px] text-mist">
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold text-fog">Product</span>
          <a href="#how" className="transition-colors hover:text-fog">
            How it works
          </a>
          <a href="#rewards" className="transition-colors hover:text-fog">
            Rewards
          </a>
          <a href="#fleet" className="transition-colors hover:text-fog">
            Fleet dashboard
          </a>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold text-fog">Company</span>
          <span>DataNerds Solutions</span>
          <span>Contact</span>
        </div>
      </div>
      <div className="font-body text-xs text-mist md:text-right">
        Rewards settled on Stacks
        <br />
        Privacy-first · nothing leaves your phone
      </div>
    </footer>
  );
}
