import { LibrarySidebar } from "@/components/library/library-sidebar";

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-6">
      <LibrarySidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
