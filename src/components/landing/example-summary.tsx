const takeaways = [
  "Six-month retention curves flatter the product because the low-intent users have already churned — measure the 90-day second-action rate instead.",
  "The guest's team ships a weekly “retention autopsy” doc: one churned cohort, one saved cohort, three hypotheses, no meetings. Template linked in show notes.",
  "Pricing lift from monthly → annual only works when the activation event happens in week 1. Otherwise annual is a churn-deferral mechanism, not a revenue one.",
  "Skip min 42–51 — tangent on crypto gaming, unrelated.",
];

export function ExampleSummary() {
  return (
    <section className="lp-sec" id="example">
      <div className="lp-container">
        <div className="lp-sec-head">
          <div className="lp-sec-label">03 — Example</div>
          <h2 className="lp-sec-title">
            What a summary looks like. <em>A real one, not a teaser.</em>
          </h2>
        </div>
        <div className="lp-example-wrap">
          <aside className="lp-example-side">
            <h3>Built to be read, not admired.</h3>
            <p>
              Every summary follows the same structure: a one-line verdict, a
              worth-it score, 3–7 takeaways, and a short paragraph of context.
              Consistent enough to scan in bulk.
            </p>
            <p>
              No AI slop. No “this episode is a fascinating deep-dive into…” We
              dropped that intro so you don&apos;t have to.
            </p>
            <div className="lp-quote">
              “I&apos;ve replaced three podcast apps with ContentGenie. My commute is mine again.”
              <cite>— Mira Okonjo, PM at a logistics startup</cite>
            </div>
          </aside>

          <article className="lp-example-card">
            <div className="lp-ex-head">
              <div className="lp-ep-cover lp-c1" aria-hidden />
              <div>
                <h4>The retention trap: why 6-month cohorts lie</h4>
                <div className="lp-show">The Curve · Ep. 214 · 1h 12m</div>
                <div className="lp-meta-r">
                  <span className="lp-score lp-s-exceptional">
                    <span className="lp-num">9.1</span> Exceptional
                  </span>
                  <span>·</span>
                  <span>Summarized 2 hours ago</span>
                </div>
              </div>
            </div>
            <div className="lp-ex-body">
              <h5>Verdict</h5>
              <p>
                Worth listening in full if you run growth or monetize retention.
                The cohort-math segment alone (min 14–28) is the best explanation
                of survivorship bias in consumer SaaS we&apos;ve heard this year.
              </p>

              <h5>Key takeaways</h5>
              <ul className="lp-ex-take">
                {takeaways.map((t, i) => (
                  <li key={t}>
                    <span className="lp-n">{String(i + 1).padStart(2, "0")}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <h5>Worth it for</h5>
              <p>
                Growth PMs, early-stage founders deciding on a pricing move, anyone
                writing a board deck about retention this quarter.
              </p>
            </div>
            <div className="lp-ex-footer">
              <span>AI summary · reviewed by you</span>
              <span className="lp-mdot">·</span>
              <span>Generated in 17s</span>
              <span className="lp-mdot">·</span>
              <span>Saved by 284 people</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
