# Regression check set

A safety net for prompt changes. **Not an eval harness** (idea.md §6).

At 10–100 users you cannot justify a 200-fixture golden set with per-slice statistics and
CI gating. You also cannot verify a prompt change by eye once real people depend on the
output. So: ~15–20 fixtures, deterministic graders, run by hand when you change a prompt.

There is deliberately no CI integration, no per-model matrix, no cost dashboard and no LLM
judge. `ParsedResume` is structured enough that arithmetic and string comparison cover what
matters, and idea.md §6 says so explicitly.

## The two rules

These are what make the set mean anything. Everything else here is plumbing.

1. **Never train on it.** The fixtures never go into a prompt, a few-shot example, a
   system instruction or a hand-tuned heuristic. The moment a fixture informs the pipeline,
   it stops measuring the pipeline.
2. **Never edit a label to match model output.** A label is changed only when a human
   re-reads the resume and finds the label was wrong about the resume — never because the
   model disagreed with it. If a label looks wrong right after a run, write down why it is
   wrong *from the resume*, or leave it alone.

Both rules apply to `graders.mjs` too. Loosening a comparison, or adding a
`SKILL_ALIASES` entry, so that a wrong answer starts counting as right is rule 2 with
extra steps.

## Running it

```bash
npm run check                      # every fixture: model + structure, writes the baseline
npm run check -- 03 05             # only fixtures whose id contains "03" or "05"
npm run check -- --structure-only  # free: resume-ats.ts only, no model calls
npm run check -- --no-write        # print, leave evals/baseline/ alone
```

It is **not** part of `npm test`, on purpose: it is slow, it costs money on every run, and
it must never gate an ordinary commit.

A full run overwrites `evals/baseline/baseline.json` and `baseline.md`, which are
committed. That is the workflow:

```bash
npm run check
git diff evals/baseline/      # this diff is the answer to "did my prompt change help?"
```

`--structure-only` writes to `evals/out/` (gitignored) instead, so a free run can never
replace the committed baseline with a partial one.

The runner exits non-zero only for operational failures — a malformed fixture, no fixtures
matched. Bad *scores* exit 0 and land in the diff, because deciding whether a score
movement is acceptable is a judgement call, not an exit code.

## Reading a diff

The pipeline runs at temperature 0.1, not 0, so the same fixtures do not give byte-identical
numbers twice. Two consecutive full runs of the five examples, same commit, no code change
in between:

| | run 1 | run 2 |
|---|---|---|
| Skills macro F1 | 0.910 | 0.884 |
| Seniority exact | 5/5 | 4/5 |
| Years MAE | 0.58 | 0.86 |

So at this size a single fixture flipping moves the seniority rate by 20 points. Read a
diff accordingly:

- **A changed metric on one fixture is noise.** Look at which fixture, and at the
  per-fixture rows, before concluding anything.
- **A metric that moves the same way across several fixtures is a signal.**
- **The valid-JSON rate and the structural pins are not noise.** Neither should ever move
  without a code change; if one does, something is actually broken.
- More fixtures is the only real fix for the variance, which is what the checklist below is
  for.

A known friction point: the model sometimes returns a vendor-qualified skill name
("AWS Lambda") where the label has the bare one ("Lambda"), which the grader counts as both
a miss and an extra. The alias table does not paper over it, because deciding that those are
the same skill *after* seeing the output is how rule 2 gets broken. If you decide the label
granularity is wrong, change the convention below, relabel every fixture to match, and say
so in the commit.

## What is graded

Deterministic graders only (`graders.mjs`, unit-tested by `test/evals-graders.test.mjs`):

| Grader | How |
|---|---|
| Skill set | precision / recall / F1 over the label set, macro-averaged across fixtures, micro reported alongside. Names canonicalised by case, surrounding punctuation and a small explicit alias table. |
| Seniority | exact match on the five-value enum. A near miss is a miss. |
| Years of experience | mean / median / max absolute error, plus the share within 1 year. |
| Contact fields | exact match for `candidate_name`, `email`, `phone`, `location`. Email compares case-insensitively; phone compares the last 10 digits; name and location ignore case, punctuation and whitespace runs. |
| Valid-JSON rate | share of fixtures where `parseResume` returned an object satisfying the `ParsedResume` contract. A throw counts as invalid. |
| Structure | `auditResumeStructure()` from `src/lib/resume-ats.ts` — the Phase 3 structural layer, reused rather than reimplemented. |

The structural grader is the one part with no model in it. `auditResumeStructure` is pure
TypeScript over positioned text, so one PDF gives one score forever, and the comparison is
exact: any drift is a change in `resume-ats.ts`, `pdf-structure.ts` or
`checks/registry.json`. That is also why structural expectations are *pinned from a run*
rather than judged by hand — see `pinned_note` in each `expected.json`.

Not graded: `summary`, `target_roles`, `suggested_search_keywords`. They are free text with
no single right answer, which is exactly the shape that would need a judge. Left out.

## Fixture format

```
evals/fixtures/<id>/
  expected.json    required — the labels
  resume.pdf       the PDF a real person would upload; enables the structural grader
  resume.txt       the text a real person would paste
  NOTES.md         optional but wanted — provenance, and what this fixture is for
```

At least one of `resume.pdf` / `resume.txt` must exist. `"input"` says which one the model
is fed; if both exist, the PDF still feeds the structural grader, so one fixture can cover
the paste path and the layout checks at once.

```json
{
  "id": "07-mid-android-kotlin",
  "example": false,
  "shape": "One line: what kind of resume this is.",
  "provenance": "Where it came from and what was changed (see Anonymising, below).",
  "input": "pdf",
  "labels": {
    "candidate_name": "...",
    "email": "...",
    "phone": "+91 ...",
    "location": ["Bengaluru", "Bengaluru, Karnataka"],
    "years_of_experience": 4.3,
    "seniority_level": "Mid-level",
    "skills": ["Kotlin", "Jetpack Compose", "..."]
  },
  "labels_note": "Anything a future reader would otherwise have to re-derive.",
  "structure": {
    "ats_score": 81.8,
    "failed_check_ids": ["contact.in_body_not_page_margin"]
  }
}
```

`loadFixtures` validates all of this before a single paid call is made, so a typo in
`seniority_level` costs nothing to find.

### Labelling conventions

Write these down once and apply them to every fixture, or the numbers stop being
comparable between runs:

- **Skills** — every technology, language, framework, database, platform, tool and named
  practice (Agile, TDD, CI/CD) that the resume shows the candidate *using*. Soft skills are
  excluded. A tool named only as the thing being replaced or migrated away from is excluded.
- **Skill granularity** — label at the granularity the resume writes. If it says
  "AWS (EC2, S3, Lambda)", label AWS, EC2, S3 and Lambda; if it only says "AWS", label AWS.
- **Contact fields** — a label may be an array of accepted renderings, for cases where more
  than one is genuinely right ("Bengaluru" / "Bengaluru, Karnataka"). Every accepted form
  is written down *before* looking at model output. Adding one afterwards is rule 2.
- **Years of experience** — total professional experience, not time in the current
  specialisation. Prefer resumes with closed date ranges. A "Present" end date makes the
  label age: record the as-of month in `labels_note`, and re-derive it from the resume if
  the set sits untouched for a year. That is rule 2 respected, not broken — the resume's
  meaning changed, the model's opinion did not.
- **Seniority** — from the experience, not the job title. Indian IT services titles inflate.

### Anonymising a real resume

Real fixtures are the point, and a resume is personal data. Before committing one:

- replace the name, email, phone and any URL with invented values; keep the *format*
  (a 10-digit Indian mobile stays a 10-digit Indian mobile, a Gmail address stays one);
- keep employer and college names only with the person's agreement, otherwise swap them
  for invented ones of the same kind (a big IT services firm for a big IT services firm);
- leave everything else — layout, wording, section order, the formatting mistakes —
  untouched. Those are what is being measured;
- update the labels to the values you substituted, and say in `provenance` that it was
  anonymised and by whom it was shared.

Re-export the PDF only if you had to edit the document. A PDF exported by a different tool
is a different structural fixture.

## The examples are not the set

The five `example-*` fixtures exist so the format is unambiguous and so the runner can be
proved end to end. **They are invented, and they are not coverage.** `npm run check` prints
"real" and "example" counts separately and says so while the real count is under 15.

Their PDFs were rendered from their `resume.txt` by `node evals/build-example-pdfs.mjs`
(needs local Chrome; only touches fixtures with `"render_pdf": true`, so it can never
overwrite a real person's PDF). The committed PDFs mean a fresh clone can run the set
without Chrome.

## What you need to supply

The checklist for the remaining ~10–15 fixtures. Every one: a real resume (anonymised as
above), hand-written labels, and a `NOTES.md` saying why it is in the set.

**Must have (the shapes this app actually serves — tech, Indian market, early-to-mid career):**

- [ ] 1. Fresher, no internship — B.Tech/BCA 2025–2026 grad, projects only, no work section.
- [ ] 2. Fresher with internships — two or three internships, where "years of experience" is
      genuinely arguable. Say in `labels_note` which reading you labelled and why.
- [ ] 3. 1–2 years, service company — Infosys/TCS/Wipro-shaped first job, client project work.
- [ ] 4. 2–4 years, product startup — one or two employers, broad stack.
- [ ] 5. 4–6 years with an inflated title — "Senior"/"Lead" in the title, mid-level scope.
- [ ] 6. Job hopper — four or more employers in five years, short stints.
- [ ] 7. Career gap — a break of a year or more, whether or not it is explained.
- [ ] 8. Non-CS degree into tech — B.Com/BSc/mechanical, self-taught or bootcamp route.
- [ ] 9. Non-engineering tech role — QA, data analyst, support, DevOps, product. Not a dev.
- [ ] 10. Two-column or sidebar layout — the Canva/Novoresume shape, as a PDF. This is the
       one that exercises the layout checks, and `checks/registry.json` carries an explicit
       caveat there: the bench could not measure a drop, so the fixture is how you watch it.
- [ ] 11. Overleaf / LaTeX PDF — a different text layer entirely from a Word export.
- [ ] 12. Three-page resume — the length check, and where skill recall usually degrades.
- [ ] 13. Scanned or image-only PDF — no text layer. Expect `ats_score: null` and status
       `no_text_layer`; this fixture checks the pipeline says so instead of scoring it 100.
- [ ] 14. Skills as a wall of text — a 60-term comma-separated paragraph, no sub-lists.
- [ ] 15. Pasted plain text — someone's actual paste, line breaks and all, no PDF.

**Nice to have, if the resumes turn up naturally:**

- [ ] 16. A resume with no email or no phone, to check the contact fields come back empty
       rather than invented.
- [ ] 17. A non-Indian-format phone number (a returning-NRI resume), same reason.
- [ ] 18. A resume you know the current pipeline handles badly, so the set contains at least
       one known-bad case you can watch improve.

**Do not build:** slices for populations this app does not serve — US/EU market resumes,
executive and C-suite profiles, academic CVs with publication lists, non-tech industries.
idea.md §6 is explicit about that, and a fixture that serves nobody still costs money on
every run.

**Per fixture, the work is:**

1. Get the resume, with permission, and anonymise it (above).
2. `mkdir evals/fixtures/<nn>-<short-shape>/`, drop in `resume.pdf` and/or `resume.txt`.
3. Write `expected.json` labels by reading the resume — not by running the pipeline.
4. `npm run check -- <nn> --structure-only` to read the structural numbers, then paste them
   into `structure` as the pin. That is the only label taken from a run, and only because
   the structural layer has no model in it.
5. `npm run check -- <nn>` to see how the pipeline does, then `npm run check` to re-pin the
   whole baseline, and commit the fixture and the baseline together.
