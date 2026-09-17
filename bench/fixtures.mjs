/**
 * Fixture matrix definition.
 *
 * Every fixture renders the SAME content (bench/content.json). Each one differs from
 * the baseline on EXACTLY ONE render option, named in `dimension`. That is what makes
 * the measured accuracy delta attributable to that dimension.
 */

/** Baseline render options. Every fixture is this object with one key changed. */
export const BASELINE_OPTIONS = {
  columns: 1,
  headings: "standard",
  bullet: "glyph",
  dateFormat: "mmYYYY",
  contactPlacement: "body",
  contactStyle: "plain",
  experienceLayout: "paragraph",
  datePlacement: "inline",
  sidebar: false,
  pagination: "auto",
  rasterize: false,
};

/**
 * `dimension` is the idea.md §1.1 dimension under test.
 * `change` is the single option override applied to BASELINE_OPTIONS.
 */
export const FIXTURES = [
  {
    id: "01-baseline",
    dimension: "baseline",
    label: "Single column, standard headings, glyph bullets, MM/YYYY dates, contact in body",
    change: {},
  },
  {
    id: "02-two-column",
    dimension: "column-layout",
    label: "Whole resume flowed into two columns",
    change: { columns: 2 },
  },
  {
    id: "03-scanned-image",
    dimension: "text-encoding",
    label: "Baseline page rasterised to an image — no text layer",
    change: { rasterize: true },
  },
  {
    id: "04-tables",
    dimension: "structure",
    label: "Experience and skills laid out in HTML tables",
    change: { experienceLayout: "table" },
  },
  {
    id: "05-creative-headings",
    dimension: "headings",
    label: "Creative section headings instead of Experience / Education / Skills",
    change: { headings: "creative" },
  },
  {
    id: "06-hyphen-bullets",
    dimension: "bullets",
    label: "Hyphens instead of glyph bullet characters",
    change: { bullet: "hyphen" },
  },
  {
    id: "07-contact-in-margin",
    dimension: "contact-placement",
    label: "Contact line in the PDF page margin (header/footer) instead of the body",
    change: { contactPlacement: "margin" },
  },
  {
    id: "08-dates-month-year",
    dimension: "date-format",
    label: "Dates as Month YYYY instead of MM/YYYY",
    change: { dateFormat: "monthYYYY" },
  },
  {
    id: "09-dates-mixed",
    dimension: "date-format",
    label: "Dates in mixed formats across entries",
    change: { dateFormat: "mixed" },
  },
  {
    id: "10-icon-contact",
    dimension: "contact-style",
    label: "Contact line prefixed with unicode icon glyphs",
    change: { contactStyle: "icons" },
  },
  {
    id: "11-two-page",
    dimension: "pagination",
    label: "Same content spread over two pages, splitting the experience section",
    change: { pagination: "force2" },
  },
  {
    id: "12-right-aligned-dates",
    dimension: "date-placement",
    label: "Dates right-aligned on the same line as the job title",
    change: { datePlacement: "right" },
  },
  {
    id: "13-sidebar-skills",
    dimension: "sidebar",
    label: "Narrow left sidebar holding contact and skills, main column holds the rest",
    change: { sidebar: true },
  },
];

export const optionsFor = (fixture) => ({ ...BASELINE_OPTIONS, ...fixture.change });
