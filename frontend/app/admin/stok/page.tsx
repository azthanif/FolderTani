import { AdminGate } from "@/components/admin/AdminShell";
import { AdminTablePage } from "@/components/admin/AdminTablePage";

export default function Page() {
  return (
    <AdminGate>
      <AdminTablePage kind="stok" />
    </AdminGate>
  );
}
