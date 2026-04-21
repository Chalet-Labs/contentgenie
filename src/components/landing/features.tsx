import { getScoreBand, getScoreLabel, type ScoreBand } from "@/lib/score-utils";

const BAND_TOKEN: Record<ScoreBand, string> = {
  exceptional: "--score-exceptional",
  above: "--score-above",
  average: "--score-average",
  below: "--score-below",
  skip: "--score-skip",
};

const scoreDemo = [
  { title: "How the internet got addicted to podcasts", score: 9.2 },
  { title: "The real cost of founder-market fit", score: 7.0 },
  { title: "Year-end tech predictions, round 4", score: 4.8 },
  { title: "Why I stopped drinking coffee", score: 1.5 },
];

const takeaways = [
  "Retention beats acquisition at 6 months",
  "3 metrics founders actually track",
  "Cold start fixes from Duolingo",
  "Pricing page copy that converts 2×",
];

const libraryColors = [
  "hsl(217 60% 55%)",
  "hsl(28 70% 58%)",
  "hsl(262 50% 58%)",
  "hsl(142 40% 48%)",
  "hsl(340 50% 58%)",
  "hsl(200 45% 50%)",
  "hsl(80 40% 48%)",
  "hsl(12 60% 55%)",
];

const discoverChips = [
  { n: "topic", v: "AI agents" },
  { n: "host", v: "60min+ avg" },
  { n: "score", v: "> 7.5" },
  { n: "saved", v: "by 100+" },
];

export function Features() {
  return (
    <section className="lp-sec" id="product">
      <div className="lp-container">
        <div className="lp-sec-head">
          <div className="lp-sec-label">01 — Product</div>
          <h2 className="lp-sec-title">
            Four tools, one job: <em>decide what deserves the next 40 minutes.</em>
          </h2>
        </div>

        <div className="lp-feat-grid">
          <div className="lp-feat lp-f-lg">
            <div className="lp-feat-num">F.01</div>
            <h3>Worth-It Score</h3>
            <p>
              Every episode gets a 1–10 rating calibrated on takeaway density,
              signal-to-noise, and how well it holds up past the intro. No chart
              crimes, no vibes.
            </p>
            <div className="lp-feat-demo">
              <div className="lp-score-row">
                {scoreDemo.map((r) => {
                  const band = getScoreBand(r.score);
                  return (
                    <div key={r.title} className="lp-row">
                      <div>
                        <div className="lp-row-title">{r.title}</div>
                        <div className="lp-bar">
                          <i style={{ width: `${r.score * 10}%`, background: `hsl(var(${BAND_TOKEN[band]}))` }} />
                        </div>
                      </div>
                      <span className={`lp-score lp-s-${band}`}>
                        <span className="lp-num">{r.score.toFixed(1)}</span> {getScoreLabel(r.score)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lp-feat lp-f-md">
            <div className="lp-feat-num">F.02</div>
            <h3>Key takeaways, not transcripts</h3>
            <p>
              Dense bullet points you can skim in 90 seconds. Quote-backed, with
              timestamps that deep-link into the episode.
            </p>
            <div className="lp-feat-demo">
              {takeaways.map((t, i) => (
                <span key={t} className="lp-chip">
                  <span className="lp-chip-n">{String(i + 1).padStart(2, "0")}</span>
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="lp-feat lp-f-md">
            <div className="lp-feat-num">F.03</div>
            <h3>A library that remembers</h3>
            <p>Collections, tags, and notes. Search your own listening history by phrase.</p>
            <div className="lp-feat-demo">
              <div className="lp-lib-grid">
                {libraryColors.map((c) => (
                  <div key={c} className="lp-lib-cell" style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>

          <div className="lp-feat lp-f-md">
            <div className="lp-feat-num">F.04</div>
            <h3>Discover, cross-indexed</h3>
            <p>
              Every public podcast feed, enriched with your listening patterns.
              Find the two episodes on a topic actually worth hearing, not the
              twenty-two that exist.
            </p>
            <div className="lp-feat-demo" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {discoverChips.map((c) => (
                <span key={c.n} className="lp-chip lp-chip-ghost">
                  <span className="lp-chip-n">{c.n}</span>
                  {c.v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
