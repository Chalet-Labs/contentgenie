import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Recent changes and improvements to ContentGenie.",
};

export default function ChangelogPage() {
  return (
    <article className="space-y-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Changelog</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Highlights from the ContentGenie public beta.
      </p>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        We&apos;re shipping fast while in beta. For a full list of releases,
        fixes, and notable changes, see the{" "}
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href="https://github.com/Chalet-Labs/contentgenie/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          CHANGELOG on GitHub
        </a>
        .
      </p>
      <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
        A curated, human-readable changelog with screenshots will land here
        before we exit beta.
      </p>
    </article>
  );
}
