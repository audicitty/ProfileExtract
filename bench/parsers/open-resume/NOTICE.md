# Vendored: open-resume resume parser

- **Source**: https://github.com/xitanggg/open-resume — `src/app/lib/parse-resume-from-pdf/`
  (plus `lib/deep-clone.ts` and a subset of `lib/redux/types.ts`)
- **Upstream commit fetched**: `main` as of 2026-09-17 (upstream's last push: 2024-10-29)
- **Licence**: AGPL-3.0 — full text in `LICENSE`
- **Why it is here**: it is oracle A of the parser bench (`bench/`), a development tool.
  It is never imported by `src/`, never reaches the request path, and is not part of the
  Next.js production bundle.

## Modifications made (AGPL-3.0 §5 requires these be stated)

1. **Import paths rewritten** from upstream's `lib/...` TypeScript path aliases to
   relative paths, so the subtree runs standalone under `tsx` without Next.js config.
   No logic changed.
2. **`read-pdf.ts` replaced.** Upstream reads a PDF in the browser via pdfjs-dist v3 and a
   worker entry point. The bench runs in Node against a file on disk with pdfjs-dist v5.
   The replacement returns the identical `TextItem[]` shape, so every other vendored
   module runs unmodified.
3. **`initialFeaturedSkills` reproduced** at the bottom of `redux-types.ts` instead of
   imported from upstream's `lib/redux/resumeSlice.ts`, to avoid pulling in Redux.

Everything else — line grouping, section grouping, and all field extraction — is upstream
code as published.
