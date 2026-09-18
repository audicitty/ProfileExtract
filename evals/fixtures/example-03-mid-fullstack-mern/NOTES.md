# EXAMPLE FIXTURE — not coverage

Invented for this repo so the fixture format is unambiguous and the runner can be proved
end to end. Not a real user's resume; not coverage.

- **Shape**: three and a half years MERN at a startup, one long comma-separated skills
  paragraph rather than sub-lists.
- **Input**: `resume.txt` — the paste path. There is no `resume.pdf`, so the structural
  layer is skipped, which is the behaviour `/enhance` has for pasted text (idea.md §1.1:
  pasted text has no layout, so it gets no structure score).
- **Why this shape**: proves the text path end to end, and the skills paragraph names AWS
  sub-services inline, which is where the granularity rule in the README earns its keep.
