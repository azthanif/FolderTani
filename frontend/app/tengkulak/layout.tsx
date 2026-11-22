import type { Metadata } from "next";
import "@/styles/dashboard.css";
import { RoleLayout } from "@/components/role/RoleLayout";

export const metadata: Metadata = { title: "TemuTani • Tengkulak" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="tengkulak">{children}</RoleLayout>;
}
