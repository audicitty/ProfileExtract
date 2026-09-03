import { redirect } from "next/navigation";

export const metadata = {
  title: "Redirecting... | ProfileExtract",
};

export default function DashboardPage() {
  redirect("/url-extract");
}
