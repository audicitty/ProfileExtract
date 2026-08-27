import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UrlExtractClient } from "@/components/UrlExtractClient";

export const metadata = {
  title: "URL Profile Extractor | ProfileExtract",
  description: "Scrape and extract LinkedIn profiles directly from URL into clean data tables and CSV.",
};

export default async function UrlExtractPage() {
  // Server-side session verification
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <UrlExtractClient />
    </div>
  );
}
