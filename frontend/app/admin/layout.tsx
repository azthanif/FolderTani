import type { Metadata } from "next";
import "@/styles/dashboard.css";
import { DashboardRoot } from "@/components/DashboardShell";
import { AdminDataProvider } from "@/components/admin/AdminData";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Temu Tani • Admin" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardRoot variant="admin">
      <AdminDataProvider>
        <AdminShell>{children}</AdminShell>
      </AdminDataProvider>
    </DashboardRoot>
  );
}
