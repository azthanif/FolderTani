"use client";
import { RoleGate } from "@/components/role/RoleLayout";
import { StocksPage } from "@/components/role/pages";

export default function Page() {
  return (
    <RoleGate>
      <StocksPage />
    </RoleGate>
  );
}
