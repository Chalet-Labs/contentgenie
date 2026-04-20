import Link from "next/link";
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
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/changelog">Changelog</Link>
          <a href="https://twitter.com/contentgenie" target="_blank" rel="noreferrer">
            @contentgenie
          </a>
        </div>
        <div>© {year} Chalet Labs</div>
      </div>
    </footer>
  );
}
