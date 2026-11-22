"use client";
import { RoleGate } from "@/components/role/RoleLayout";
import { OffersPage } from "@/components/role/pages";

export default function Page() {
  return (
    <RoleGate>
      <OffersPage />
    </RoleGate>
  );
}
