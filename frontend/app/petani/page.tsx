"use client";
import { RoleGate } from "@/components/role/RoleLayout";
import { OverviewPage } from "@/components/role/pages";

export default function Page() {
  return (
    <RoleGate>
      <OverviewPage />
    </RoleGate>
  );
}
