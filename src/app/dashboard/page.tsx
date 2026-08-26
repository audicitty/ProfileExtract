import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardClient } from "@/components/DashboardClient";

export const metadata = {
  title: "Dashboard | ProfileExtract",
  description: "Extract and structure LinkedIn profiles into clean data tables and CSV.",
};

export default async function DashboardPage() {
  // Server-side session verification on every request
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    redirect("/login");
  }

  return <DashboardClient />;
}
