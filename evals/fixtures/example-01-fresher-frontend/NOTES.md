# EXAMPLE FIXTURE — not coverage

Invented for this repo so the fixture format is unambiguous and the runner can be proved
end to end. It is not a real user's resume and must not be counted as one of the ~15-20
fixtures idea.md §6 asks for.

- **Shape**: fresher, one role since Jul 2025, tier-2 city, skills in labelled sub-lists.
- **Input**: `resume.pdf` (rendered from `resume.txt` by `node evals/build-example-pdfs.mjs`).
- **Why this shape**: the most common resume this app will see, and the one where
  `years_of_experience` is easiest to get wrong in the other direction — an internship-free
  fresher with a single role.
- **Label edge case**: jQuery appears in a bullet only as the thing being replaced, so it is
  not labelled as a skill.
- **Structural pin**: `contact.in_body_not_page_margin` fails because the contact line sits
  in the top page margin, which is exactly what this template puts there. Pinned from a
  real run, not a judgement.
