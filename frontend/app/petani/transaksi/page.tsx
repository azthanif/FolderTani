"use client";
import { RoleGate } from "@/components/role/RoleLayout";
import { TransactionsPage } from "@/components/role/pages";

export default function Page() {
  return (
    <RoleGate>
      <TransactionsPage />
    </RoleGate>
  );
}
