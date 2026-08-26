export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">ProfileExtract</span>
          <span>&bull;</span>
          <span>Stateless LinkedIn profile text structuring &amp; CSV export</span>
        </div>
        <p className="text-slate-400">
          Operates exclusively on user-pasted plain text. No scraping or persistence.
        </p>
      </div>
    </footer>
  );
}
