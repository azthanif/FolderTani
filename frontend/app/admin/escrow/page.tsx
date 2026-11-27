import { AdminGate } from "@/components/admin/AdminShell";
import { AdminEscrow } from "@/components/admin/AdminEscrow";

export default function Page() {
  return (
    <AdminGate>
      <AdminEscrow />
    </AdminGate>
  );
}
