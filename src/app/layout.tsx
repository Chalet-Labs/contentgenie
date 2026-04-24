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

const APP_URL_FALLBACK = "https://contentgenie.app";

function isAllowedAppUrl(url: URL): boolean {
  if (url.protocol === "https:") return true;
  return process.env.NODE_ENV === "development" && url.protocol === "http:";
}

function resolveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (!isAllowedAppUrl(url)) {
        throw new Error(`Unsupported protocol: ${url.protocol}`);
      }
      return url.toString().replace(/\/$/, "");
    } catch {
      console.error(
        `[layout] NEXT_PUBLIC_APP_URL is not a valid absolute URL (${JSON.stringify(explicit)}). ` +
          `Falling back to ${APP_URL_FALLBACK}.`,
      );
      return APP_URL_FALLBACK;
    }
  }
  if (process.env.NODE_ENV !== "development") {
    console.warn(
      "[layout] NEXT_PUBLIC_APP_URL is not set in a non-development build. " +
        `Falling back to ${APP_URL_FALLBACK} — metadataBase and OG tags may be wrong.`,
    );
  }
  return APP_URL_FALLBACK;
}

const APP_URL = resolveAppUrl();

function resolveAppOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!isAllowedAppUrl(url)) {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
    return url.origin;
  } catch (err) {
    console.error(
      "[layout] Invalid NEXT_PUBLIC_APP_URL for Clerk allowedRedirectOrigins",
      { url: raw, err },
    );
    return undefined;
  }
}

const ALLOWED_REDIRECT_ORIGINS = [
  resolveAppOrigin(),
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
].filter((v): v is string => Boolean(v));

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
  themeColor: "#F59E0B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      allowedRedirectOrigins={ALLOWED_REDIRECT_ORIGINS}
    >
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NuqsAdapter>{children}</NuqsAdapter>
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
          <ServiceWorkerRegistrar />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
