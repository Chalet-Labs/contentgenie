import { ArrowRight, Sparkle } from "lucide-react";
import { getScoreBand, getScoreLabel } from "@/lib/score-utils";

type CoverColor = "c1" | "c2" | "c3" | "c4" | "c5";

interface Episode {
  cover: CoverColor;
  title: string;
  show: string;
  dur: string;
  ago: string;
  score: number;
}

const episodes: Episode[] = [
  { cover: "c1", title: "The retention trap: why 6-month cohorts lie", show: "The Curve", dur: "1h 12m", ago: "2h", score: 9.1 },
  { cover: "c2", title: "What founder-market fit actually looks like", show: "Acquired Minds", dur: "58m", ago: "5h", score: 7.8 },
  { cover: "c3", title: "Pricing moves that actually moved the needle", show: "MRR Mornings", dur: "44m", ago: "1d", score: 6.4 },
  { cover: "c4", title: "Year-end tech predictions, round 4", show: "Decoder Daily", dur: "1h 6m", ago: "1d", score: 4.3 },
  { cover: "c5", title: "Why I stopped drinking coffee (for real)", show: "Long Life Labs", dur: "38m", ago: "2d", score: 1.4 },
];

export function HeroSurface() {
  return (
    <div className="lp-surface-wrap">
      <div className="lp-surface">
        <div className="lp-surface-bar">
          <div className="lp-traffic" aria-hidden>
            <i /><i /><i />
          </div>
          <span>contentgenie.app / inbox</span>
          <span className="lp-pill">
            <ArrowRight size={10} strokeWidth={3} /> {episodes.length} to review
          </span>
        </div>
        <div className="lp-surface-title">
          <h3>Today&apos;s queue</h3>
          <span className="lp-count">{episodes.length} new episodes</span>
          <span className="lp-filter">Sort: Score ↓</span>
        </div>
        <div className="lp-ep-list">
          {episodes.map((e, i) => (
            <div key={e.title} className={`lp-ep${i === 0 ? " lp-active" : ""}`}>
              <div className={`lp-ep-cover lp-${e.cover}`} aria-hidden />
              <div className="lp-ep-body">
                <div className="lp-ep-title">{e.title}</div>
                <div className="lp-ep-meta">
                  <span>{e.show}</span>
                  <span className="lp-sep">·</span>
                  <span>{e.dur}</span>
                  <span className="lp-sep">·</span>
                  <span>{e.ago} ago</span>
                </div>
              </div>
              <span className={`lp-score lp-s-${getScoreBand(e.score)}`}>
                <span className="lp-num">{e.score.toFixed(1)}</span> {getScoreLabel(e.score)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-float-summary">
        <div className="lp-fs-head">
          <Sparkle className="lp-spark" size={12} fill="currentColor" strokeWidth={0} />
          AI SUMMARY · 17S
        </div>
        <div className="lp-fs-title">The retention trap: why 6-month cohorts lie</div>
        <ul className="lp-fs-list">
          <li><span className="lp-bullet">1</span>Six-month retention flatters the product — measure 90-day second-action rate instead.</li>
          <li><span className="lp-bullet">2</span>A weekly retention autopsy doc beats a retention meeting. Always.</li>
          <li><span className="lp-bullet">3</span>Annual pricing = churn deferral unless week-1 activation lands.</li>
        </ul>
        <div className="lp-fs-foot">
          <span className="lp-gen">
            Worth-It: <b className="lp-score-inline lp-s-exceptional">9.1 Exceptional</b>
          </span>
        </div>
      </div>
    </div>
  );
}
