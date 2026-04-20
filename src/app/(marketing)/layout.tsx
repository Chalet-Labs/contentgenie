import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="lp min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
