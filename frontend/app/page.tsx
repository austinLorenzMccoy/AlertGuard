import { FleetPreview } from "@/components/landing/FleetPreview";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Nav } from "@/components/landing/Nav";
import { Rewards } from "@/components/landing/Rewards";
import { SplitCta } from "@/components/landing/SplitCta";

/**
 * Marketing landing page (AlertGuard landing design canvas, per the Frontend
 * PRD's Section 1 companion doc — see docs/AlertGuard — Full Build
 * Wireframe.html's "Marketing · Landing page" board for the source design).
 * Visitors land here first; `/login` (fleet managers/admins) and `/download`
 * (drivers) are reached via the CTAs below, not the root path itself.
 */
export default function RootPage() {
  return (
    <main className="overflow-hidden bg-ink">
      <Nav />
      <Hero />
      <HowItWorks />
      <FleetPreview />
      <Rewards />
      <SplitCta />
      <Footer />
    </main>
  );
}
