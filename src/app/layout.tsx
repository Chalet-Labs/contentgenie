import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { Toaster } from "@/components/ui/sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://contentgenie.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "ContentGenie — Triage the podcasts worth your time",
    template: "%s · ContentGenie",
  },
  description:
    "AI-generated Worth-It scores, distilled takeaways, and a library that remembers. Stop mining 90 minutes of podcast for 9.",
  applicationName: "ContentGenie",
  keywords: [
    "podcast summaries",
    "AI podcast",
    "podcast discovery",
    "worth-it score",
    "podcast library",
    "podcast triage",
  ],
  authors: [{ name: "Chalet Labs" }],
  creator: "Chalet Labs",
  openGraph: {
    type: "website",
    siteName: "ContentGenie",
    locale: "en_US",
    url: APP_URL,
    title: "ContentGenie — Triage the podcasts worth your time",
    description:
      "AI-generated Worth-It scores, distilled takeaways, and a library that remembers. Stop mining 90 minutes of podcast for 9.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ContentGenie — Triage the podcasts worth your time",
    description:
      "AI-generated Worth-It scores, distilled takeaways, and a library that remembers.",
    creator: "@contentgenie",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ContentGenie",
  },
  icons: {
    icon: "/icon-192x192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      allowedRedirectOrigins={[
        (() => {
          try {
            return process.env.NEXT_PUBLIC_APP_URL
              ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
              : undefined;
          } catch {
            return undefined;
          }
        })(),
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : undefined,
      ].filter((v): v is string => Boolean(v))}
    >
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NuqsAdapter>
              {children}
            </NuqsAdapter>
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
          <ServiceWorkerRegistrar />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
