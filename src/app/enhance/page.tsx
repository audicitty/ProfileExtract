import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ResumeEnhancerClient } from "@/components/ResumeEnhancerClient";

export const metadata = {
  title: "Resume Enhancer & ATS Audit | ProfileExtract",
  description:
    "Audit your resume against measured ATS parser behaviour, get content findings, copyable rewritten bullets, and a plain-text ATS-safe version.",
};

export default async function EnhancePage() {
  // Server-side session verification
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ResumeEnhancerClient />
    </div>
  );
}
