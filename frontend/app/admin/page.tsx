import { AdminGate } from "@/components/admin/AdminShell";
import { AdminOverview } from "@/components/admin/Overview";

export default function AdminOverviewPage() {
  return (
    <AdminGate>
      <AdminOverview />
    </AdminGate>
  );
}
