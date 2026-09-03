"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { FileText, AlertCircle, ArrowRight } from "lucide-react";
import { AuthVisualPanel } from "@/components/AuthVisualPanel";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await signIn.email({
        email: trimmedEmail,
        password,
      });

      if (res.error) {
        setError("Invalid email or password. Please check your credentials.");
        setLoading(false);
        return;
      }

      router.push("/url-extract");
      router.refresh();
    } catch {
      setError("Invalid email or password. Please check your credentials.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:items-center">
        <AuthVisualPanel
          title="Welcome back"
          subtitle="Sign in to keep extracting LinkedIn profiles by URL and matching live jobs with AI."
        />

        <div className="w-full max-w-md mx-auto lg:mx-0 space-y-6">
          {/* Brand Icon & Heading */}
          <div className="text-center space-y-2 lg:hidden">
            <div
              className="gradient-brand inline-flex h-10 w-10 items-center justify-center rounded-lg text-white"
              style={{ boxShadow: "var(--shadow-surface-1)" }}
            >
              <FileText className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in to ProfileExtract
            </h1>
            <p className="text-xs text-slate-500">
              Access your profile extraction workspace
            </p>
          </div>

          {/* Login Card */}
          <div
            className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
            style={{ boxShadow: "var(--shadow-surface-2)" }}
          >
            {error && (
              <div
                role="alert"
                className="alert-shake-in mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <p className="leading-relaxed">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="input-glow w-full rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-glow w-full rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`cta-primary w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  loading ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-[#0f4c81] hover:underline"
              >
                Sign up free
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
