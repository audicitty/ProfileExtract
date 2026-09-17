/**
 * Check definitions: the prose half of checks/registry.yaml.
 *
 * Severities are NOT written here. `node bench/build-registry.mjs` joins each check to
 * the measurement in bench/results/severity.json by fixture id and emits registry.yaml,
 * so a severity in the registry can only come from a bench run.
 *
 * layer:
 *   drop          - the resume cannot be audited at all until this is fixed
 *   deterministic - checkable in TypeScript from the PDF's positioned text (Phase 3)
 *   llm           - subjective content judgement, left to the model (Phase 4)
 *   untested      - candidate dimension, no fixture yet, therefore no severity
 */

export const CHECKS = [
  {
    id: "parseability.text_layer_present",
    statement:
      "The PDF must carry a real text layer. A scanned or image-only resume yields no fields at all.",
    layer: "drop",
    fixture: "03-scanned-image",
    assertion:
      "extractedText.replace(/\\s/g, '').length >= 200 for a one-page resume; otherwise stop and tell the user to export a text PDF.",
  },
  {
    id: "structure.standard_section_headings",
    statement:
      "Section headings must use conventional words (Experience, Education, Skills, Projects). Creative headings cost more parsed fields than any other formatting choice that keeps a text layer.",
    layer: "deterministic",
    fixture: "05-creative-headings",
    assertion:
      "every detected section heading line matches the standard-heading keyword list used by the section detector.",
  },
  {
    id: "contact.in_body_not_page_margin",
    statement:
      "Contact details must sit in the document body, not in the page header/footer margin.",
    layer: "deterministic",
    fixture: "07-contact-in-margin",
    assertion:
      "no text item carrying an email, phone or URL has y within the top or bottom 10% of the page box.",
  },
  {
    id: "structure.length_one_page",
    statement:
      "A resume spread over two pages loses work-history fields at the page boundary.",
    layer: "deterministic",
    fixture: "11-two-page",
    assertion: "pdf.numPages === 1, or the section split across the boundary is reported.",
  },
  {
    id: "layout.single_column_reading_order",
    statement:
      "A two-column layout makes the page's visual reading order disagree with its flow order. Neither bench oracle is affected, because both read in flow order; a parser that sorts text top-to-bottom would read the columns interleaved.",
    layer: "deterministic",
    fixture: "02-two-column",
    assertion:
      "visual (y descending, x ascending) reading order agrees with flow order; bench/results/layout.json reports order_agreement per fixture.",
    caveat:
      "NOT SETTLED by this bench. Measured drop is 0.0 for both oracles, but bench/results/layout.json measures order_agreement 0.224 for this fixture versus 1.0 for the baseline, so the risk is real for a y-sorting parser and unobservable through these two.",
  },
  {
    id: "layout.sidebar_reading_order",
    statement:
      "A narrow sidebar column has the same reading-order ambiguity as a full two-column layout, less severely.",
    layer: "deterministic",
    fixture: "13-sidebar-skills",
    assertion:
      "no page region holds a vertical block of text side by side with the main column; layout.json reports order_agreement.",
    caveat:
      "NOT SETTLED by this bench, same reason as layout.single_column_reading_order. Measured order_agreement 0.83 versus 1.0 at baseline.",
  },
  {
    id: "structure.no_tables",
    statement:
      "Experience and skills laid out in HTML/Word tables. Widely claimed to break ATS parsing; not reproduced here.",
    layer: "deterministic",
    fixture: "04-tables",
    assertion:
      "no text item belongs to a repeating row/column grid (detected from aligned x positions across consecutive lines).",
  },
  {
    id: "structure.glyph_bullets",
    statement:
      "Bullet lists marked with hyphens instead of a bullet glyph. Commonly listed as an ATS risk; not reproduced here.",
    layer: "deterministic",
    fixture: "06-hyphen-bullets",
    assertion: "every list line starts with a character in the bullet-glyph set.",
  },
  {
    id: "dates.consistent_format",
    statement:
      "Mixed date formats across entries (03/2022, Jul 2019, 2018). Commonly listed as an ATS risk; not reproduced here.",
    layer: "deterministic",
    fixture: "09-dates-mixed",
    assertion: "all detected date ranges match one format.",
  },
  {
    id: "dates.numeric_month_format",
    statement:
      "Month YYYY dates instead of MM/YYYY. Not reproduced here as a parsing risk.",
    layer: "deterministic",
    fixture: "08-dates-month-year",
    assertion: "date ranges match a single recognised pattern.",
  },
  {
    id: "dates.inline_not_right_aligned",
    statement:
      "Dates right-aligned on the job-title line rather than on their own line. Not reproduced here as a parsing risk.",
    layer: "deterministic",
    fixture: "12-right-aligned-dates",
    assertion: "a date item is not separated from its title item by a gap larger than one column width.",
  },
  {
    id: "contact.no_icon_glyphs",
    statement:
      "Unicode icon glyphs before contact details (envelope, phone, house). Not reproduced here as a parsing risk.",
    layer: "deterministic",
    fixture: "10-icon-contact",
    assertion: "contact lines contain no symbol-block glyphs (U+2190-U+2BFF).",
  },

  // ---- candidate dimensions with no fixture yet: no severity may be claimed ----
  {
    id: "structure.no_embedded_images",
    statement:
      "Logos, headshots or text baked into images inside an otherwise text-layer resume.",
    layer: "untested",
    fixture: null,
    assertion: "page has no XObject image covering more than 5% of the page area.",
    source_hypothesis: "ats-screener format-scorer (MIT)",
  },
  {
    id: "structure.no_all_caps_blocks",
    statement: "Whole lines of body text in capitals.",
    layer: "untested",
    fixture: null,
    assertion: "no non-heading line is entirely uppercase.",
    source_hypothesis: "ats-screener format-scorer (MIT)",
  },
  {
    id: "structure.special_character_density",
    statement: "A high density of unusual characters, often a sign of a broken export.",
    layer: "untested",
    fixture: null,
    assertion: "non-alphanumeric, non-punctuation characters stay under a threshold share of the text.",
    source_hypothesis: "ats-screener format-scorer (MIT)",
  },

  // ---- content judgement: outside what a parser bench can measure ----
  {
    id: "content.quantified_bullets",
    statement: "Bullets state a measurable outcome rather than a duty.",
    layer: "llm",
    fixture: null,
    assertion: "model returns a boolean per bullet; TypeScript aggregates. No bench severity exists for this.",
  },
  {
    id: "content.strong_action_verbs",
    statement: "Bullets open with a specific action verb, not a passive or filler phrase.",
    layer: "llm",
    fixture: null,
    assertion: "model returns a boolean per bullet.",
  },
  {
    id: "content.no_buzzword_padding",
    statement: "The summary and skills avoid unsupported superlatives and filler.",
    layer: "llm",
    fixture: null,
    assertion: "model returns flagged phrases with offsets.",
  },
  {
    id: "content.tense_consistency",
    statement: "Past roles use past tense; the current role uses present tense.",
    layer: "llm",
    fixture: null,
    assertion: "model returns a boolean per role.",
  },
  {
    id: "content.keyword_gap_vs_jd",
    statement:
      "Skills named in a target job description that the resume never mentions.",
    layer: "llm",
    fixture: null,
    assertion:
      "token-boundary match of JD skills against resume text; the model only proposes where to add them.",
  },
];
