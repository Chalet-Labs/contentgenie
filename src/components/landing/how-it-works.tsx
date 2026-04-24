const steps = [
  {
    n: "STEP.01",
    title: "Subscribe to a show",
    desc: "Pull from your existing app via OPML, or search a catalog of 4.2M podcasts.",
    tick: "Imports in < 10s",
  },
  {
    n: "STEP.02",
    title: "We transcribe new episodes",
    desc: "Diarized, timestamped, and cached. The job runs in the background — you don't wait.",
    tick: "~2 min per hour of audio",
  },
  {
    n: "STEP.03",
    title: "AI rates & distills",
    desc: "Worth-It score, 3–7 takeaways, a one-line verdict. No fluff, no “in this episode we discuss…”",
    tick: "Under 20s",
  },
  {
    n: "STEP.04",
    title: "You decide, in seconds",
    desc: "Save, skip, or listen. The library keeps what you cared about and forgets the rest.",
    tick: "Avg triage: 4s/episode",
  },
];

export function HowItWorks() {
  return (
    <section className="lp-sec" id="how">
      <div className="lp-container">
        <div className="lp-sec-head">
          <div className="lp-sec-label">02 — How it works</div>
          <h2 className="lp-sec-title">
            Paste a feed. <em>Summaries show up, quietly.</em>
          </h2>
        </div>
        <div className="lp-flow">
          {steps.map((s) => (
            <div key={s.n} className="lp-step">
              <span className="lp-step-n">{s.n}</span>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
              <span className="lp-tick">
                <span className="lp-b" /> {s.tick}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
