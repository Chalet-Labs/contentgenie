import { JoinBetaButton } from "@/components/landing/join-beta-button";

export function FinalCta() {
  return (
    <section className="lp-cta">
      <div className="lp-container">
        <h2>
          Join the beta.
          <br />
          Pay nothing, keep the discount.
        </h2>
        <p>
          Free while we&apos;re in beta. Everyone inside gets 50% off for life.
        </p>
        <div className="lp-cta-actions">
          <JoinBetaButton label="Claim your seat" withArrow={false} />
        </div>
      </div>
    </section>
  );
}
