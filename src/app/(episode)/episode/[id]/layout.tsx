import { auth } from "@clerk/nextjs/server";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { AppShell } from "@/components/layout/app-shell";

export default async function EpisodeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (userId) {
    return <AppShell>{children}</AppShell>;
  }

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
