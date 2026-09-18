# EXAMPLE FIXTURE — not coverage

Invented for this repo so the fixture format is unambiguous and the runner can be proved
end to end. Not a real user's resume; not coverage.

- **Shape**: four years of Java/Spring Boot at an IT services firm, one employer, client
  project work.
- **Input**: `resume.pdf` (rendered from `resume.txt`).
- **Why this shape**: the internal title is "Senior Systems Engineer" at four years'
  experience. Indian IT services titles inflate, and this fixture checks that
  `seniority_level` follows the experience rather than the job title.
- **Structural pin**: ats_score 100. The two date checks that fail carry 0 measured
  severity points, so they do not move the score — see `checks/registry.json`.
