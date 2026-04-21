import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroSurface } from "@/components/landing/hero-surface";
import { JoinBetaButton } from "@/components/landing/join-beta-button";

export function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div>
          <span className="lp-eyebrow">
            <span className="lp-dot" />
            Now in public beta
          </span>
          <h1 className="lp-hero-title">
            Triage the podcasts<br />
            worth your time. <em>Skip the rest.</em>
          </h1>
          <p className="lp-hero-sub">
            ContentGenie rates every episode with an AI-generated Worth-It score,
            distills the key takeaways, and lets you save only what&apos;s actually
            useful — so you stop mining 90 minutes for 9.
          </p>
          <div className="lp-hero-cta">
            <JoinBetaButton />
            <Button asChild variant="outline" size="lg">
              <a href="#example">See a real summary</a>
            </Button>
          </div>
          <div className="lp-hero-meta">
            <span><Check className="lp-check" size={13} strokeWidth={3} aria-hidden="true" /> Free while in beta</span>
            <span><Check className="lp-check" size={13} strokeWidth={3} aria-hidden="true" /> 50% off forever</span>
            <span><Check className="lp-check" size={13} strokeWidth={3} aria-hidden="true" /> Cancel anytime</span>
          </div>
        </div>

        <HeroSurface />
      </div>
    </section>
  );
}
