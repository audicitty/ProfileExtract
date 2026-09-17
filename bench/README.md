# Parser bench

A development tool. It answers one question with measurement instead of folklore:

> When a resume is formatted a particular way, how many fields does a real parser actually
> lose?

The answer becomes the severity weight for the matching check in `checks/registry.yaml`,
which Phase 3 will apply in TypeScript. Nothing here is imported by `src/`, runs in a
request, or ships in the Next.js bundle — `bench/` is excluded from `tsconfig.json` and
from ESLint.

## How it works

1. **One resume's content** lives in `content.json` and never changes between fixtures.
2. **`fixtures.mjs`** defines 13 fixtures. Each one overrides **exactly one** render option
   against the baseline; `build-fixtures.mjs` refuses to build a fixture that changes two.
3. **`build-fixtures.mjs`** renders each fixture to HTML and prints it to PDF with the
   locally installed Chrome (`--no-pdf-header-footer`, so Chrome injects no date/URL header
   into the text layer). Each PDF gets a manifest naming the varied dimension and the
   expected field values.
4. **`run.mjs`** feeds every fixture to both oracles and scores the extracted fields against
   the manifest, one probe per field. A parser's accuracy on a fixture is the mean of its
   probes.
5. **Severity** of a dimension = baseline accuracy − that fixture's accuracy, per parser.
   That subtraction is the only definition of severity used anywhere.
6. **`build-registry.mjs`** joins the statements in `../checks/checks.mjs` to those
   measurements and writes `../checks/registry.yaml` (plus a `.json` twin for product code).
   A severity cannot be hand-written: `test/checks-registry.test.mjs` regenerates the
   registry and fails if the committed file drifts.

## The two oracles

| | open-resume | pyresparser |
|---|---|---|
| Language | TypeScript, in-process | Python, subprocess |
| Reads the PDF with | `pdfjs-dist` positioned text items | `pdfminer.six` layout analysis |
| Fields | name, email, phone, location, url, skills, work, education, bullets | name, email, phone, skills, sections, experience text, education, bullets |
| Licence | AGPL-3.0 (vendored — see `parsers/open-resume/NOTICE.md`) | GPL-3.0 (pip, run as a separate process) |

Both had to be adapted, and both adaptations are documented where they live:
`parsers/open-resume/NOTICE.md` and the docstring of `parsers/pyresparser_adapter.py`.
pyresparser cannot run as published on Python 3.12 at all — its bundled NER model is in
spaCy v2 format and spaCy 3 rejects it.

**Neither oracle is Workday or Greenhouse.** They are a far better proxy than blog advice,
and still a proxy. A dimension only one of them flags is marked `single-parser` in the
registry and must not be presented to a user as fact.

**Both read in flow order.** Neither sorts text top-to-bottom across the page, which is the
usual explanation for two-column resumes breaking in commercial ATS. So this bench cannot
observe that failure mode through its oracles. `analyze-layout.mjs` measures the ambiguity
on the fixture PDF instead (`results/layout.json`), and the affected registry entries carry
an explicit `caveat`.

## Running it

```bash
npm run bench:setup      # once: creates bench/.venv and installs oracle B + PyMuPDF
npm run bench:fixtures   # renders the 13 fixture PDFs into bench/out/
npm run bench            # runs the matrix, writes bench/results/
npm run bench:registry   # regenerates checks/registry.yaml and registry.json
```

`bench/.venv/` and `bench/out/` are gitignored. `bench/results/` is committed: it is the
evidence the registry rests on.

Needs Chrome (set `CHROME_PATH` if it is not in a standard location) and Python 3.12+
(`PYTHON` / `BENCH_PYTHON` override the interpreter).

## Reading the results

- `results/matrix.md` — fixture × parser accuracy, plus every individual probe.
- `results/severity.md` — the drop each dimension causes, and whether both parsers agree.
- `results/layout.json` — structural facts about the fixture PDFs themselves.

## Content caveat

`content.json` uses a phone in 3-3-4 digit groups and a `City, ST` location because both
oracles are US-centric and would score zero on those fields otherwise. Fields that fail at
baseline cannot show degradation, so the baseline is deliberately a format both parsers
handle. Oracle B still scores 81.3% at baseline: its skills list covers half of the
resume's skills and its education extractor never matches the degree. Those two failures
are constant across every fixture, so they cancel out of the severity subtraction, but they
do make oracle B less sensitive than oracle A.
