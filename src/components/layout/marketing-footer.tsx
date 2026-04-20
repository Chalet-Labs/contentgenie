import "./marketing-footer.css";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer">
      <div className="lp-foot-inner">
        <div className="lp-brand">
          <div className="lp-brand-mark">C</div>
          ContentGenie
        </div>
        <div className="lp-foot-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/changelog">Changelog</a>
          <a href="https://twitter.com/contentgenie" target="_blank" rel="noreferrer">
            @contentgenie
          </a>
        </div>
        <div>© {year} Chalet Labs</div>
      </div>
    </footer>
  );
}
