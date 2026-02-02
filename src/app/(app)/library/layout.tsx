import { LibrarySidebar } from "@/components/library/library-sidebar";

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-6">
      <LibrarySidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
