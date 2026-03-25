import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { ADMIN_ROLE } from "@/lib/auth-roles"
import { AdminTabNav } from "@/components/admin/admin-tab-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { has } = await auth()
  if (!has({ role: ADMIN_ROLE })) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">System administration and configuration.</p>
      </div>
      <AdminTabNav />
      {children}
    </div>
  )
}
