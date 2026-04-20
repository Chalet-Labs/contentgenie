import { JetBrains_Mono } from "next/font/google";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ExampleSummary } from "@/components/landing/example-summary";
import { Pricing } from "@/components/landing/pricing";
import { FinalCta } from "@/components/landing/final-cta";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import "@/components/landing/landing.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export default function Home() {
  return (
    <div className={`lp ${jetbrainsMono.variable} min-h-screen bg-background text-foreground`}>
      <MarketingHeader />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <ExampleSummary />
        <Pricing />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
