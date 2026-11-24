import { AdminGate } from "@/components/admin/AdminShell";
import { AdminAccounts } from "@/components/admin/AdminAccounts";

export default function Page() {
  return (
    <AdminGate what="kelola akun">
      <AdminAccounts />
    </AdminGate>
  );
}
