export function LoadingSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-6" aria-busy="true" aria-label="Structuring profile data">
      {/* Action Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-100" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-32 rounded bg-slate-200" />
          <div className="h-9 w-24 rounded bg-slate-200" />
        </div>
      </div>

      {/* Profile Overview Hero Card Skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 flex-1">
            <div className="h-7 w-64 rounded bg-slate-200" />
            <div className="h-4 w-3/4 rounded bg-slate-100" />
            <div className="flex flex-wrap gap-4 pt-1">
              <div className="h-4 w-36 rounded bg-slate-200" />
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-4 w-32 rounded bg-slate-200" />
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4 space-y-2">
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-5/6 rounded bg-slate-100" />
        </div>
      </div>

      {/* Two Column Grid for Experience and Education */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Experience Skeleton */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="h-5 w-32 rounded bg-slate-200" />
            <div className="h-4 w-12 rounded bg-slate-100" />
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-36 rounded bg-slate-200" />
                <div className="h-3 w-20 rounded bg-slate-100" />
              </div>
              <div className="h-3 w-28 rounded bg-slate-100" />
              <div className="h-3 w-full rounded bg-slate-100" />
            </div>
          ))}
        </div>

        {/* Education Skeleton */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="h-5 w-28 rounded bg-slate-200" />
            <div className="h-4 w-12 rounded bg-slate-100" />
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-3 w-16 rounded bg-slate-100" />
              </div>
              <div className="h-3 w-32 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Projects & Certifications Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <div className="h-5 w-24 rounded bg-slate-200 pb-2" />
          <div className="space-y-2">
            <div className="h-4 w-44 rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-100" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <div className="h-5 w-32 rounded bg-slate-200 pb-2" />
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-100" />
          </div>
        </div>
      </div>

      {/* Skills Skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="h-5 w-20 rounded bg-slate-200" />
        <div className="flex flex-wrap gap-2">
          {[60, 80, 48, 72, 90, 64, 84, 56, 76].map((w, idx) => (
            <div
              key={idx}
              className="h-7 rounded-md bg-slate-200"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
