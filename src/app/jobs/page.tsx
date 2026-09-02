import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { JobMatcherClient } from "@/components/JobMatcherClient";

export const metadata = {
  title: "AI Resume Scanner & LinkedIn Job Matcher | ProfileExtract",
  description:
    "Scan your resume, filter active LinkedIn jobs by location, workplace type, and date posted, and get AI match scores with direct apply links.",
};

export default async function JobsPage() {
  // Server-side session verification
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <JobMatcherClient />
    </div>
  );
}
