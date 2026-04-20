import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ContentGenie",
  description: "How ContentGenie handles your data.",
};

export default function PrivacyPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Placeholder — full policy coming before we exit beta.
      </p>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        ContentGenie is in public beta. We&apos;re finalizing our formal privacy policy.
        In the meantime: we store the podcast subscriptions, summaries, and notes you
        create, and we use your email only for product updates. We do not sell your
        data. Analytics are aggregated and anonymized. AI summaries are generated
        via third-party providers (see{" "}
        <Link className="underline underline-offset-4 hover:text-foreground" href="/terms" prefetch={false}>
          Terms
        </Link>
        ) and not retained by them beyond the request.
      </p>
      <p className="text-[15px] leading-relaxed text-muted-foreground mt-6">
        Questions?{" "}
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href="mailto:hello@contentgenie.app"
        >
          hello@contentgenie.app
        </a>
      </p>
    </article>
  );
}
