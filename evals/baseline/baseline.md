# Regression check baseline

Generated 2026-09-18T05:30:17.940Z at commit `66bd4dc` by `npm run check` (mode: full).

Deterministic graders only — no LLM judge (idea.md §6). Parsed by
`parseResume() from src/lib/resume.ts`, over the model candidates
`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-flash-latest`.
resume.ts walks that candidate list and returns the first model that answers; it does not report which one did. Temperature is 0.1, not 0, so small run-to-run variation is expected and is not by itself a regression.

Structural grader: `auditResumeStructure() from src/lib/resume-ats.ts`, against the registry measured
2026-09-17T14:26:18.164Z.

How to read the skill columns: recall is what the model missed, precision counts everything
it returned that the label does not list. `parseResume` is asked for "professional" skills
as well as technical ones, while the labels cover named technologies and practices only
(evals/README.md), so some precision loss is structural rather than an error.

## Summary

| Metric | Value |
|---|---|
| Fixtures | 5 (0 real, 5 example) |
| Valid `ParsedResume` rate | 5/5 — 100.0% |
| Skills macro precision | 0.821 |
| Skills macro recall | 0.964 |
| Skills macro F1 | 0.884 |
| Skills micro precision / recall | 0.828 / 0.96 |
| Seniority exact match | 4/5 — 80.0% |
| Years of experience MAE | 0.86 (median 0.3, max 2) |
| Years within 1 year | 60.0% |
| Structural scores matching pin | 3/3 (0 drifted) |

### Contact fields

| Field | Matched | Rate |
|---|---|---|
| candidate_name | 5/5 | 100.0% |
| email | 5/5 | 100.0% |
| phone | 5/5 | 100.0% |
| location | 5/5 | 100.0% |

## Per fixture

| Fixture | Kind | Input | Valid JSON | Skill P | Skill R | Skill F1 | Seniority | YoE error | ATS score | Structure |
|---|---|---|---|---|---|---|---|---|---|---|
| example-01-fresher-frontend | example | pdf | yes | 0.79 | 1.00 | 0.88 | match | 0.2 | 81.8 | match |
| example-02-mid-backend-java | example | pdf | yes | 0.85 | 1.00 | 0.92 | miss | 0.3 | 100 | match |
| example-03-mid-fullstack-mern | example | text | yes | 0.86 | 0.82 | 0.84 | match | 1.8 | — | not_labelled |
| example-04-support-to-data-analyst | example | pdf | yes | 0.77 | 1.00 | 0.87 | match | 0 | 81.8 | match |
| example-05-senior-devops | example | text | yes | 0.84 | 1.00 | 0.92 | match | 2 | — | not_labelled |

## Skill differences

- **example-01-fresher-frontend** — missed: none; extra: component testing, performance optimization, product development, ui/ux development
- **example-02-mid-backend-java** — missed: none; extra: mentoring, performance tuning, query optimization, transaction reconciliation
- **example-03-mid-fullstack-mern** — missed: aws, ec2, lambda, s3; extra: aws ec2, aws lambda, aws s3
- **example-04-support-to-data-analyst** — missed: none; extra: data modeling, production support, sla compliance, supply chain reporting
- **example-05-senior-devops** — missed: none; extra: backup and restore, container scanning, rightsizing, s3 lifecycle rules, spot node groups
