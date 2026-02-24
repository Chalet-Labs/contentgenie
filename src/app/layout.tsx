import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ContentGenie - Podcast Summaries for Busy Professionals",
  description:
    "Discover, summarize, and save podcast content with AI-powered insights",
  applicationName: "ContentGenie",
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
      allowedRedirectOrigins={[
        process.env.NEXT_PUBLIC_APP_URL,
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
      ].filter((v): v is string | RegExp => Boolean(v))}
    >
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
          <ServiceWorkerRegistrar />
        </body>
      </html>
    </ClerkProvider>
  );
}
