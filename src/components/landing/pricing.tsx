import { JoinBetaButton } from "@/components/landing/join-beta-button";

const features = [
  "Unlimited AI summaries",
  "Unlimited library + collections",
  "Worth-It scores on everything",
  "OPML, RSS & full catalog import",
  "Full-text search across notes",
  "Priority summarization queue",
  "Grandfathered 50% off, forever",
];

const promises = [
  { n: "No card", l: "required" },
  { n: "30s", l: "sign-up" },
  { n: "Cancel", l: "anytime" },
];

export function Pricing() {
  return (
    <section className="lp-sec" id="pricing">
      <div className="lp-container">
        <div className="lp-sec-head">
          <div className="lp-sec-label">04 — Pricing</div>
          <h2 className="lp-sec-title">
            Free while we&apos;re in beta. <em>Your timing is the deal.</em>
          </h2>
        </div>

        <div className="lp-beta-card">
          <div className="lp-beta-left">
            <div className="lp-beta-tag">
              <span className="lp-beta-dot" />
              PUBLIC BETA · LIMITED SEATS
            </div>
            <div className="lp-beta-price">
              <span className="lp-beta-strike">
                $9<span className="lp-beta-per">/mo</span>
              </span>
              <span className="lp-beta-now">$0</span>
              <span className="lp-beta-until">while in beta</span>
            </div>
            <p className="lp-beta-pitch">
              Every ContentGenie feature — unlimited summaries, unlimited
              library, priority queue, OPML import — free for everyone who joins
              before we leave beta. Your account is grandfathered:{" "}
              <strong>50% off forever</strong> when we start charging.
            </p>
            <div className="lp-beta-cta">
              <JoinBetaButton
                label="Claim your seat — free"
                withArrow={false}
              />
              <span className="lp-beta-note">
                No credit card. 30-second sign-up.
              </span>
            </div>
          </div>
          <div className="lp-beta-right">
            <ul className="lp-beta-feat">
              {features.map((f) => (
                <li key={f}>
                  <span className="lp-check" aria-hidden>
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="lp-beta-stats">
              {promises.map((p) => (
                <div key={p.l}>
                  <div className="lp-bs-n">{p.n}</div>
                  <div className="lp-bs-l">{p.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
