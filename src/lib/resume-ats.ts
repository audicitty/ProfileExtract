/**
 * Structural ATS checks — the deterministic half of the Resume Enhancer.
 *
 * idea.md §1.1: ATS-friendliness is an empirical question. Every weight used here was
 * measured by the parser bench (`bench/`) and lives in checks/registry.json; this file
 * never chooses a number. Change a severity by re-running `npm run bench:registry`, not
 * by editing code.
 *
 * Two rules hold for everything below:
 *
 *   1. No model calls, no network, no request-path coupling — ever. idea.md §6 reuses
 *      this module as a regression grader, which only works if it is pure.
 *   2. Every check returns a structured finding, never a bare boolean, so the UI can
 *      explain what it saw.
 *
 * Only checks with `layer: "deterministic"` in the registry are implemented. `llm`
 * checks belong to the Phase 4 content layer, `untested` ones have no measured severity,
 * and the `drop`-layer gate (`parseability.text_layer_present`) is the caller's, not
 * this module's — see `auditResumeStructure` for what happens when there is no text.
 */
import registryJson from "../../checks/registry.json";

import type {
  AtsCategory,
  AtsFinding,
  AtsSeverity,
  PdfPage,
  ResumeAudit,
  ResumeDocument,
  ResumeIssue,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Registry — the only source of severities                                    */
/* -------------------------------------------------------------------------- */

export interface RegistryCheck {
  id: string;
  statement: string;
  layer: "drop" | "deterministic" | "llm" | "untested";
  severity_status: string;
  severity_points: number | null;
  parsers_agreed: string[];
  confidence: string;
  evidence_fixture: string | null;
  assertion: string;
  caveat?: string;
}

export interface AtsRegistry {
  bench_run_at: string;
  flag_threshold_points: number;
  checks: RegistryCheck[];
}

export const ATS_REGISTRY = registryJson as unknown as AtsRegistry;

const REGISTRY_BY_ID = new Map(ATS_REGISTRY.checks.map((check) => [check.id, check]));

export function registryCheck(id: string): RegistryCheck {
  const check = REGISTRY_BY_ID.get(id);
  if (!check) throw new Error(`check ${id} is not in checks/registry.json`);
  return check;
}

/**
 * The bench-measured weight for a check, in accuracy points. Throws rather than
 * defaulting: a check with no measured severity must not be scored (CLAUDE.md §8.2).
 */
export function severityPointsFor(id: string): number {
  const check = registryCheck(id);
  if (check.severity_points === null) {
    throw new Error(`check ${id} has no measured severity and cannot be scored`);
  }
  return check.severity_points;
}

/**
 * Display band, derived from the registry's own flag threshold rather than a new
 * invented cutoff: at or above 4x the threshold is critical, at or above it is a
 * warning, below it (including a measured zero) is minor.
 */
const CRITICAL_MULTIPLE = 4;

export function severityLabel(points: number): AtsSeverity {
  const threshold = ATS_REGISTRY.flag_threshold_points;
  if (points >= threshold * CRITICAL_MULTIPLE) return "critical";
  if (points >= threshold) return "warning";
  return "minor";
}

const categoryOf = (id: string): AtsCategory => id.split(".")[0] as AtsCategory;

/* -------------------------------------------------------------------------- */
/* Geometry — lines, blocks and columns from positioned text                   */
/* -------------------------------------------------------------------------- */

/** Items within this vertical distance are one line. Same value the bench uses. */
export const Y_TOLERANCE = 2;
/** Horizontal gap that separates two blocks on one line. Same value the bench uses. */
export const COLUMN_GAP = 40;

export interface TextBlock {
  x: number;
  end_x: number;
  text: string;
  font_size_max: number;
  /** Index of the x-cluster this block belongs to, within its page. */
  cluster: number;
}

export interface TextLine {
  page: number;
  y: number;
  /** Position of this line in the page, top to bottom. */
  index: number;
  blocks: TextBlock[];
  text: string;
  font_size_max: number;
}

export interface ColumnCluster {
  index: number;
  x_min: number;
  x_max: number;
  y_top: number;
  y_bottom: number;
  line_indexes: number[];
  /** Lines where this cluster holds every block, i.e. content of its own. */
  exclusive_lines: number;
  is_column: boolean;
  width_share: number;
  vertical_coverage: number;
}

export interface PageLayout {
  page: number;
  height: number;
  width: number;
  y_origin: number;
  lines: TextLine[];
  clusters: ColumnCluster[];
  columns: ColumnCluster[];
  multi_column: boolean;
  sidebar_shaped: boolean;
  text_width: number;
  median_line_pitch: number;
}

/** A cluster needs this many lines, and this many lines of its own, to be a column. */
const MIN_COLUMN_LINES = 3;
const MIN_EXCLUSIVE_LINES = 2;
/** Below these shares, a second column reads as a sidebar rather than a full column. */
const SIDEBAR_WIDTH_SHARE = 0.4;
const SIDEBAR_COVERAGE = 0.5;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Groups a page's items into lines, and each line into horizontally separated blocks. */
export function buildPageLines(page: PdfPage): TextLine[] {
  const items = page.items
    .filter((item) => item.text.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: { y: number; items: typeof items }[] = [];
  for (const item of items) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Y_TOLERANCE);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }

  return rows.map((row, index) => {
    const ordered = [...row.items].sort((a, b) => a.x - b.x);
    const blocks: TextBlock[] = [];
    for (const item of ordered) {
      const current = blocks[blocks.length - 1];
      const endX = item.x + item.width;
      if (!current || item.x - current.end_x > COLUMN_GAP) {
        blocks.push({
          x: item.x,
          end_x: endX,
          text: item.text,
          font_size_max: item.font_size,
          cluster: -1,
        });
        continue;
      }
      // pdf.js splits a visual line into several items; re-join them, inserting a space
      // only where the gap is wide enough to be one.
      const gap = item.x - current.end_x;
      const needsSpace =
        gap > item.font_size * 0.25 &&
        !current.text.endsWith(" ") &&
        !item.text.startsWith(" ");
      current.text += `${needsSpace ? " " : ""}${item.text}`;
      current.end_x = Math.max(current.end_x, endX);
      current.font_size_max = Math.max(current.font_size_max, item.font_size);
    }

    const cleaned = blocks.map((block) => ({ ...block, text: block.text.trim() }));
    return {
      page: page.number,
      y: row.y,
      index,
      blocks: cleaned,
      text: cleaned.map((block) => block.text).join("  "),
      font_size_max: cleaned.reduce((max, block) => Math.max(max, block.font_size_max), 0),
    };
  });
}

export function renderLinesAsText(lines: TextLine[]): string {
  return lines.map((line) => line.text).join("\n");
}

/**
 * Column detection.
 *
 * Blocks are clustered by their left edge. A cluster counts as a real layout column only
 * if it has lines of its own — lines where nothing else on the page shares the row. That
 * is what separates a sidebar or a second column (which carries its own content) from a
 * table or a right-aligned date (which always pairs with the row it sits in).
 */
export function analyzePageLayout(page: PdfPage): PageLayout {
  const lines = buildPageLines(page);
  const entries = lines.flatMap((line) =>
    line.blocks.map((block) => ({ line: line.index, block }))
  );

  const sorted = [...entries].sort((a, b) => a.block.x - b.block.x);
  const groups: (typeof sorted)[] = [];
  for (const entry of sorted) {
    const group = groups[groups.length - 1];
    if (!group || entry.block.x - group[group.length - 1].block.x > COLUMN_GAP) {
      groups.push([entry]);
    } else {
      group.push(entry);
    }
  }
  groups.forEach((group, index) =>
    group.forEach((entry) => {
      entry.block.cluster = index;
    })
  );

  const textWidth = entries.length
    ? Math.max(...entries.map((entry) => entry.block.end_x)) -
      Math.min(...entries.map((entry) => entry.block.x))
    : 0;
  const yTopAll = lines.length ? lines[0].y : 0;
  const yBottomAll = lines.length ? lines[lines.length - 1].y : 0;
  const textHeight = yTopAll - yBottomAll;

  const clusters: ColumnCluster[] = groups.map((group, index) => {
    const lineIndexes = [...new Set(group.map((entry) => entry.line))].sort((a, b) => a - b);
    const exclusive = lineIndexes.filter((lineIndex) =>
      lines[lineIndex].blocks.every((block) => block.cluster === index)
    ).length;
    const xMin = Math.min(...group.map((entry) => entry.block.x));
    const xMax = Math.max(...group.map((entry) => entry.block.end_x));
    const ys = lineIndexes.map((lineIndex) => lines[lineIndex].y);
    const yTop = Math.max(...ys);
    const yBottom = Math.min(...ys);
    return {
      index,
      x_min: xMin,
      x_max: xMax,
      y_top: yTop,
      y_bottom: yBottom,
      line_indexes: lineIndexes,
      exclusive_lines: exclusive,
      is_column: lineIndexes.length >= MIN_COLUMN_LINES && exclusive >= MIN_EXCLUSIVE_LINES,
      width_share: textWidth ? (xMax - xMin) / textWidth : 0,
      vertical_coverage: textHeight ? (yTop - yBottom) / textHeight : 0,
    };
  });

  const columns = clusters.filter((cluster) => cluster.is_column);
  const multiColumn = columns.length >= 2;
  const sidebarShaped =
    multiColumn &&
    columns.some(
      (column) =>
        column.width_share < SIDEBAR_WIDTH_SHARE ||
        column.vertical_coverage < SIDEBAR_COVERAGE
    );

  const pitches: number[] = [];
  for (let i = 0; i < lines.length - 1; i++) pitches.push(lines[i].y - lines[i + 1].y);

  return {
    page: page.number,
    height: page.height,
    width: page.width,
    y_origin: page.y_origin,
    lines,
    clusters,
    columns,
    multi_column: multiColumn,
    sidebar_shaped: sidebarShaped,
    text_width: textWidth,
    median_line_pitch: median(pitches),
  };
}

export function analyzeDocument(doc: ResumeDocument): PageLayout[] {
  return doc.pages.map(analyzePageLayout);
}

/**
 * How much a top-to-bottom, left-to-right reading of the pages agrees with the order the
 * file itself declares. Same measure as bench/analyze-layout.mjs, so a finding here can
 * be compared against bench/results/layout.json.
 */
export function readingOrderAgreement(doc: ResumeDocument): number | null {
  const items = doc.items;
  if (items.length < 2) return null;
  const visual = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const position = new Map(visual.map((item, index) => [item.flow_index, index]));
  let adjacent = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const here = position.get(items[i].flow_index) ?? 0;
    const next = position.get(items[i + 1].flow_index) ?? 0;
    if (next - here === 1) adjacent++;
  }
  return adjacent / (items.length - 1);
}

/** Blocks on one line that belong to the same column, i.e. a row of that column. */
function rowsOf(line: TextLine, layout: PageLayout): TextBlock[][] {
  if (!layout.multi_column) return [line.blocks];
  // Column x-ranges can overlap — a full-width line such as the contact header widens
  // whichever cluster it starts in — so a block belongs to the rightmost column that
  // starts at or before it, not to the first range that happens to contain it.
  const byStart = [...layout.columns].sort((a, b) => b.x_min - a.x_min);
  const byColumn = new Map<number, TextBlock[]>();
  for (const block of line.blocks) {
    const column =
      byStart.find((candidate) => block.x >= candidate.x_min - 1) ??
      byStart[byStart.length - 1];
    const bucket = byColumn.get(column.index) ?? [];
    bucket.push(block);
    byColumn.set(column.index, bucket);
  }
  return [...byColumn.values()];
}

/* -------------------------------------------------------------------------- */
/* Text predicates                                                             */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github|gitlab|medium|behance|dribbble)\.com\/\S+/i;
/** Deliberately narrow: loose phone patterns swallow date ranges like "08/2014 - 05/2018". */
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3,5}\)?[\s.-]\d{3,4}[\s.-]?\d{3,4}\b/;

export function contactKinds(text: string): string[] {
  const kinds: string[] = [];
  if (EMAIL_RE.test(text)) kinds.push("email");
  if (PHONE_RE.test(text)) kinds.push("phone");
  if (URL_RE.test(text)) kinds.push("url");
  return kinds;
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_TOKENS: { kind: string; pattern: string }[] = [
  { kind: "YYYY-MM", pattern: "(?:19|20)\\d{2}-(?:0[1-9]|1[0-2])" },
  { kind: "Month YYYY", pattern: `${MONTH}\\s+(?:19|20)\\d{2}` },
  { kind: "MM/YYYY", pattern: "(?:0?[1-9]|1[0-2])[/-](?:19|20)\\d{2}" },
  { kind: "YYYY", pattern: "(?:19|20)\\d{2}" },
];
const OPEN_ENDED = "present|current|ongoing|now|to date|till date";
const TOKEN_ALTERNATION = DATE_TOKENS.map((token) => token.pattern).join("|");
const RANGE_PATTERN =
  `(${TOKEN_ALTERNATION})\\s*(?:[-–—]|to|through|until)\\s*` +
  `((?:${TOKEN_ALTERNATION})|(?:${OPEN_ENDED}))`;

export interface DateRange {
  text: string;
  /** Format of each endpoint. An open-ended end ("Present") contributes no format. */
  kinds: string[];
}

/** Every date range in the text, with the format of each endpoint named. */
export function findDateRanges(text: string): DateRange[] {
  const ranges: DateRange[] = [];
  // Built per call: a shared /g regex carries lastIndex between calls, which would make
  // the result depend on call order. This module has to be deterministic.
  for (const match of text.matchAll(new RegExp(RANGE_PATTERN, "gi"))) {
    const kinds = [match[1], match[2]]
      .map((side) => classifyDateToken(side))
      .filter((kind): kind is string => kind !== null);
    ranges.push({ text: match[0], kinds });
  }
  return ranges;
}

export function classifyDateToken(token: string): string | null {
  const value = token.trim();
  if (new RegExp(`^(?:${OPEN_ENDED})$`, "i").test(value)) return null;
  for (const candidate of DATE_TOKENS) {
    if (new RegExp(`^(?:${candidate.pattern})$`, "i").test(value)) return candidate.kind;
  }
  return null;
}

/** Bullet markers the registry calls the glyph set, and the ones it does not. */
export const GLYPH_BULLETS = [
  "•", "◦", "▪", "▫", "‣", "·", "●", "○",
  "∙", "⁃", "■", "□", "▸", "▶", "►",
];
export const NON_GLYPH_BULLETS = ["-", "–", "—", "*", "+", ">", "~", "»"];
const BULLET_MARKERS = [...GLYPH_BULLETS, ...NON_GLYPH_BULLETS];

/** The marker a line opens with, or null when the line is not a list item. */
export function bulletMarkerOf(text: string): string | null {
  const first = text.charAt(0);
  if (!BULLET_MARKERS.includes(first)) return null;
  const rest = text.slice(1).trim();
  if (rest.length < 3) return null;
  // A hyphen only counts as a bullet when a word follows it, so "-15% churn" stays prose.
  if (NON_GLYPH_BULLETS.includes(first) && !/^[A-Za-z]/.test(rest)) return null;
  return first;
}

export const STANDARD_HEADING_KEYWORDS = [
  "summary", "professional summary", "career summary", "objective", "profile", "about me",
  "experience", "work experience", "professional experience", "employment",
  "employment history", "work history", "career history",
  "education", "academic background", "academics", "qualifications",
  "skills", "technical skills", "core competencies", "competencies", "technologies",
  "projects", "personal projects", "selected projects", "portfolio",
  "certifications", "certificates", "licenses", "courses", "coursework", "training",
  "awards", "honors", "honours", "achievements", "publications", "research",
  "languages", "volunteer", "leadership", "activities", "interests", "references",
  "contact", "contact details",
];

const normalizeHeading = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function isStandardHeading(text: string): boolean {
  const padded = ` ${normalizeHeading(text)} `;
  return STANDARD_HEADING_KEYWORDS.some((keyword) => padded.includes(` ${keyword} `));
}

/**
 * Lines that look like section headings: set in a larger face than the body, or short
 * and fully capitalised. The document title (the name at the top of page one) is
 * excluded — it is not a section heading, and it is always the largest thing on the page.
 */
export function headingLines(doc: ResumeDocument, layouts: PageLayout[]): TextLine[] {
  const weights = new Map<number, number>();
  for (const item of doc.items) {
    const size = Math.round(item.font_size * 2) / 2;
    weights.set(size, (weights.get(size) ?? 0) + item.text.trim().length);
  }
  let bodySize = 0;
  let bodyWeight = -1;
  for (const [size, weight] of weights) {
    if (weight > bodyWeight) {
      bodySize = size;
      bodyWeight = weight;
    }
  }
  const maxSize = Math.max(...doc.items.map((item) => item.font_size), 0);
  // The name at the top of page one is the largest line in the document and is not a
  // section heading. Identify it by size rather than by position: a header or footer can
  // sit above it on the page.
  const titleLine = layouts[0]?.lines.find((line) => line.font_size_max >= maxSize - 0.01);

  const headings: TextLine[] = [];
  for (const layout of layouts) {
    for (const line of layout.lines) {
      if (layout.page === 1 && line === titleLine) continue;
      if (contactKinds(line.text).length) continue;
      const words = line.text.trim().split(/\s+/);
      if (words.length > 8 || line.text.length > 60) continue;
      // A date line is not a heading, however it is set — "08/2014 - 05/2018" has no
      // lower-case letters and would otherwise read as a capitalised heading.
      if (findDateRanges(line.text).length) continue;
      const letters = line.text.replace(/[^A-Za-z]/g, "").length;
      if (letters < 3 || letters / line.text.replace(/\s/g, "").length < 0.5) continue;
      const larger = line.font_size_max >= bodySize + 0.5;
      const capitalised =
        /[A-Z]/.test(line.text) &&
        line.text === line.text.toUpperCase() &&
        !/\d/.test(line.text) &&
        words.length <= 6;
      if (larger || capitalised) headings.push(line);
    }
  }
  return headings;
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

interface FindingInput {
  status: AtsFinding["status"];
  detail: string;
  evidence?: string[];
  measurements?: Record<string, number | string | boolean>;
}

function finding(id: string, input: FindingInput): AtsFinding {
  const check = registryCheck(id);
  const points = severityPointsFor(id);
  return {
    check_id: id,
    category: categoryOf(id),
    statement: check.statement,
    status: input.status,
    severity_points: points,
    points_deducted: input.status === "fail" ? points : 0,
    confidence: check.confidence,
    ...(check.caveat ? { caveat: check.caveat } : {}),
    detail: input.detail,
    evidence: input.evidence ?? [],
    measurements: input.measurements ?? {},
  };
}

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/* -------------------------------------------------------------------------- */
/* The deterministic checks                                                    */
/* -------------------------------------------------------------------------- */

const ID = {
  headings: "structure.standard_section_headings",
  contactMargin: "contact.in_body_not_page_margin",
  onePage: "structure.length_one_page",
  singleColumn: "layout.single_column_reading_order",
  sidebar: "layout.sidebar_reading_order",
  tables: "structure.no_tables",
  bullets: "structure.glyph_bullets",
  dateConsistency: "dates.consistent_format",
  dateNumeric: "dates.numeric_month_format",
  dateInline: "dates.inline_not_right_aligned",
  contactIcons: "contact.no_icon_glyphs",
} as const;

/** structure.standard_section_headings — the heaviest measured check, 39.8 points. */
export function checkStandardSectionHeadings(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  const headings = headingLines(doc, layouts);
  if (!headings.length) {
    return finding(ID.headings, {
      status: "not_applicable",
      detail:
        "No heading-like lines were found, so there is nothing to compare against the " +
        "standard heading list.",
      measurements: { headings_detected: 0 },
    });
  }
  const nonStandard = headings.filter((line) => !isStandardHeading(line.text));
  if (!nonStandard.length) {
    return finding(ID.headings, {
      status: "pass",
      detail: `All ${headings.length} section headings use conventional wording.`,
      evidence: headings.map((line) => line.text),
      measurements: { headings_detected: headings.length, non_standard: 0 },
    });
  }
  return finding(ID.headings, {
    status: "fail",
    detail:
      `${nonStandard.length} of ${headings.length} section headings are not words a ` +
      "parser looks for, so the sections under them are not recognised as sections.",
    evidence: nonStandard.map((line) => `page ${line.page}: "${line.text}"`),
    measurements: { headings_detected: headings.length, non_standard: nonStandard.length },
  });
}

/** contact.in_body_not_page_margin — 18.2 points, single-parser evidence. */
export function checkContactInBody(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  const contactLines = layouts.flatMap((layout) =>
    layout.lines
      .filter((line) => contactKinds(line.text).length)
      .map((line) => ({ line, layout }))
  );
  if (!contactLines.length) {
    return finding(ID.contactMargin, {
      status: "not_applicable",
      detail: "No email, phone number or URL was found in the text layer.",
      measurements: { contact_lines: 0 },
    });
  }

  const inMargin = contactLines.filter(({ line, layout }) => {
    const top = layout.y_origin + layout.height * 0.9;
    const bottom = layout.y_origin + layout.height * 0.1;
    const inBand = line.y >= top || line.y <= bottom;
    if (!inBand) return false;
    // Being near the page edge is not enough — the body's own first line usually is too.
    // A header or footer is also detached from the body by more than a line's spacing.
    const pitch = layout.median_line_pitch || 0;
    const neighbour =
      line.y >= top ? layout.lines[line.index + 1] : layout.lines[line.index - 1];
    if (!neighbour) return true;
    return Math.abs(line.y - neighbour.y) > pitch * 2;
  });

  if (!inMargin.length) {
    return finding(ID.contactMargin, {
      status: "pass",
      detail: "Contact details sit in the document body.",
      evidence: contactLines.map(({ line }) => line.text),
      measurements: { contact_lines: contactLines.length, in_margin: 0 },
    });
  }
  return finding(ID.contactMargin, {
    status: "fail",
    detail:
      "Contact details sit in the page header/footer margin, detached from the body. " +
      "Parsers that read the body text block miss them entirely.",
    evidence: inMargin.map(
      ({ line, layout }) =>
        `page ${line.page} at y=${round(line.y)} of ${round(layout.height)}: "${line.text}"`
    ),
    measurements: { contact_lines: contactLines.length, in_margin: inMargin.length },
  });
}

/** structure.length_one_page — 4.6 points, single-parser evidence. */
export function checkSinglePage(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  if (doc.page_count <= 1) {
    return finding(ID.onePage, {
      status: "pass",
      detail: "The resume is one page, so nothing is split across a page boundary.",
      measurements: { pages: doc.page_count },
    });
  }
  const first = layouts[0];
  const second = layouts[1];
  const lastOfFirst = first?.lines[first.lines.length - 1]?.text ?? "";
  const firstOfSecond = second?.lines[0]?.text ?? "";
  return finding(ID.onePage, {
    status: "fail",
    detail:
      `The resume runs to ${doc.page_count} pages. Work-history fields either side of ` +
      "the boundary are the ones that get lost.",
    evidence: [`page 1 ends: "${lastOfFirst}"`, `page 2 begins: "${firstOfSecond}"`],
    measurements: { pages: doc.page_count },
  });
}

/**
 * layout.single_column_reading_order — measured 0, and NOT settled: both bench oracles
 * read in flow order, so neither can see the ambiguity this reports. The registry caveat
 * travels with the finding.
 */
export function checkSingleColumnReadingOrder(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  const agreement = readingOrderAgreement(doc);
  const twoColumnPages = layouts.filter(
    (layout) => layout.multi_column && !layout.sidebar_shaped
  );
  const measurements = {
    order_agreement: agreement === null ? "n/a" : round(agreement, 3),
    two_column_pages: twoColumnPages.length,
  };

  if (!doc.items.length) {
    return finding(ID.singleColumn, {
      status: "not_applicable",
      detail: "No text items, so the page has no reading order to check.",
      measurements,
    });
  }
  if (twoColumnPages.length) {
    return finding(ID.singleColumn, {
      status: "fail",
      detail:
        `${twoColumnPages.length} page(s) are laid out in two full columns. A parser ` +
        "that sorts text top-to-bottom reads the columns interleaved.",
      evidence: twoColumnPages.map(
        (layout) =>
          `page ${layout.page}: ${layout.columns.length} columns at x=${layout.columns
            .map((column) => round(column.x_min))
            .join(", ")}`
      ),
      measurements,
    });
  }
  // A sidebar is the other check's business; do not report the same page twice.
  const sidebarElsewhere = layouts.some((layout) => layout.sidebar_shaped);
  // Fallback for a layout the column detector did not recognise. A handful of items out
  // of flow order (one header line, say) is not a column layout, so the disagreement has
  // to be both proportionally large and more than incidental.
  const transitions = Math.max(doc.items.length - 1, 0);
  const disagreements = agreement === null ? 0 : Math.round((1 - agreement) * transitions);
  if (!sidebarElsewhere && agreement !== null && agreement < 0.9 && disagreements >= 5) {
    return finding(ID.singleColumn, {
      status: "fail",
      detail:
        `Visual reading order agrees with the file's own order only ${round(
          agreement * 100
        )}% of the time, so the text does not flow in one column.`,
      measurements,
    });
  }
  return finding(ID.singleColumn, {
    status: "pass",
    detail: "The text flows in a single column, in the order it is laid out.",
    measurements,
  });
}

/** layout.sidebar_reading_order — measured 0, same unsettled caveat as the above. */
export function checkSidebarReadingOrder(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  const sidebarPages = layouts.filter((layout) => layout.sidebar_shaped);
  const agreement = readingOrderAgreement(doc);
  const measurements = {
    order_agreement: agreement === null ? "n/a" : round(agreement, 3),
    sidebar_pages: sidebarPages.length,
  };
  if (!doc.items.length) {
    return finding(ID.sidebar, {
      status: "not_applicable",
      detail: "No text items, so there is no layout to check.",
      measurements,
    });
  }
  if (!sidebarPages.length) {
    return finding(ID.sidebar, {
      status: "pass",
      detail: "No block of text runs alongside the main column.",
      measurements,
    });
  }
  return finding(ID.sidebar, {
    status: "fail",
    detail:
      "A narrow sidebar column runs beside the main column, so the page's visual order " +
      "and its flow order disagree.",
    evidence: sidebarPages.map((layout) => {
      const narrow = layout.columns.reduce((min, column) =>
        column.width_share < min.width_share ? column : min
      );
      return (
        `page ${layout.page}: sidebar at x=${round(narrow.x_min)}, ` +
        `${round(narrow.width_share * 100)}% of the text width`
      );
    }),
    measurements,
  });
}

/** structure.no_tables — measured 0 across both oracles. */
export function checkNoTables(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  if (!doc.items.length) {
    return finding(ID.tables, {
      status: "not_applicable",
      detail: "No text items, so there is no grid to detect.",
      measurements: { grid_rows: 0 },
    });
  }

  const grids: string[] = [];
  for (const layout of layouts) {
    for (let i = 0; i < layout.lines.length - 1; i++) {
      const here = rowsOf(layout.lines[i], layout).filter((row) => row.length >= 2);
      const next = rowsOf(layout.lines[i + 1], layout).filter((row) => row.length >= 2);
      for (const row of here) {
        for (const candidate of next) {
          const aligned = row.filter((cell) =>
            candidate.some((other) => Math.abs(other.x - cell.x) <= 3)
          );
          if (aligned.length >= 2) {
            grids.push(
              `page ${layout.page}: "${layout.lines[i].text}" / "${layout.lines[i + 1].text}" ` +
                `share ${aligned.length} column positions`
            );
          }
        }
      }
    }
  }

  if (!grids.length) {
    return finding(ID.tables, {
      status: "pass",
      detail: "No repeating row/column grid was found.",
      measurements: { grid_rows: 0 },
    });
  }
  return finding(ID.tables, {
    status: "fail",
    detail:
      `${grids.length} pair(s) of consecutive lines share aligned column positions, which ` +
      "is what a table looks like in a PDF's text layer.",
    evidence: grids.slice(0, 5),
    measurements: { grid_rows: grids.length },
  });
}

/** structure.glyph_bullets — measured 0 across both oracles. */
export function checkGlyphBullets(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  const markers: { marker: string; text: string; page: number }[] = [];
  for (const layout of layouts) {
    for (const line of layout.lines) {
      for (const block of line.blocks) {
        const marker = bulletMarkerOf(block.text);
        if (marker) markers.push({ marker, text: block.text, page: line.page });
      }
    }
  }
  if (markers.length < 2) {
    return finding(ID.bullets, {
      status: "not_applicable",
      detail: "No bullet list was found in the text layer.",
      measurements: { bullet_lines: markers.length },
    });
  }
  const nonGlyph = markers.filter((entry) => NON_GLYPH_BULLETS.includes(entry.marker));
  if (!nonGlyph.length) {
    return finding(ID.bullets, {
      status: "pass",
      detail: `All ${markers.length} list lines open with a bullet glyph.`,
      measurements: { bullet_lines: markers.length, non_glyph: 0 },
    });
  }
  return finding(ID.bullets, {
    status: "fail",
    detail:
      `${nonGlyph.length} of ${markers.length} list lines are marked with "${nonGlyph[0].marker}" ` +
      "rather than a bullet glyph.",
    evidence: nonGlyph.slice(0, 5).map((entry) => `page ${entry.page}: "${entry.text}"`),
    measurements: {
      bullet_lines: markers.length,
      non_glyph: nonGlyph.length,
      marker: nonGlyph[0].marker,
    },
  });
}

/** dates.consistent_format — measured 0 across both oracles. */
export function checkConsistentDateFormat(doc: ResumeDocument): AtsFinding {
  const ranges = findDateRanges(doc.text);
  const kinds = [...new Set(ranges.flatMap((range) => range.kinds))];
  if (!ranges.length) {
    return finding(ID.dateConsistency, {
      status: "not_applicable",
      detail: "No date ranges were found in the text layer.",
      measurements: { ranges: 0 },
    });
  }
  if (kinds.length <= 1) {
    return finding(ID.dateConsistency, {
      status: "pass",
      detail: `All ${ranges.length} date ranges use one format (${kinds[0] ?? "open-ended"}).`,
      measurements: { ranges: ranges.length, formats: kinds.length },
    });
  }
  return finding(ID.dateConsistency, {
    status: "fail",
    detail: `Date ranges mix ${kinds.length} formats: ${kinds.join(", ")}.`,
    evidence: ranges.map((range) => `${range.text} (${range.kinds.join(", ") || "open"})`),
    measurements: { ranges: ranges.length, formats: kinds.length },
  });
}

/** dates.numeric_month_format — measured 0 across both oracles. */
export function checkNumericMonthFormat(doc: ResumeDocument): AtsFinding {
  const ranges = findDateRanges(doc.text);
  if (!ranges.length) {
    return finding(ID.dateNumeric, {
      status: "not_applicable",
      detail: "No date ranges were found in the text layer.",
      measurements: { ranges: 0 },
    });
  }
  const named = ranges.filter((range) => range.kinds.includes("Month YYYY"));
  if (!named.length) {
    return finding(ID.dateNumeric, {
      status: "pass",
      detail: "Date ranges use numeric months.",
      measurements: { ranges: ranges.length, month_name_ranges: 0 },
    });
  }
  return finding(ID.dateNumeric, {
    status: "fail",
    detail:
      `${named.length} of ${ranges.length} date ranges spell the month out rather than ` +
      "using MM/YYYY.",
    evidence: named.slice(0, 5).map((range) => range.text),
    measurements: { ranges: ranges.length, month_name_ranges: named.length },
  });
}

/** dates.inline_not_right_aligned — measured 0 across both oracles. */
export function checkInlineDates(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  if (!doc.items.length) {
    return finding(ID.dateInline, {
      status: "not_applicable",
      detail: "No text items, so there are no dates to place.",
      measurements: { detached_dates: 0 },
    });
  }
  const detached: string[] = [];
  for (const layout of layouts) {
    for (const line of layout.lines) {
      for (const row of rowsOf(line, layout)) {
        if (row.length < 2) continue;
        const ordered = [...row].sort((a, b) => a.x - b.x);
        for (let i = 1; i < ordered.length; i++) {
          const block = ordered[i];
          const previous = ordered[i - 1];
          if (!findDateRanges(block.text).length) continue;
          if (findDateRanges(previous.text).length) continue;
          detached.push(
            `page ${line.page}: "${previous.text}" ... "${block.text}" ` +
              `(${round(block.x - previous.end_x)}pt apart)`
          );
        }
      }
    }
  }
  if (!detached.length) {
    return finding(ID.dateInline, {
      status: "pass",
      detail: "Dates sit next to the entry they belong to, not pushed to the far margin.",
      measurements: { detached_dates: 0 },
    });
  }
  return finding(ID.dateInline, {
    status: "fail",
    detail:
      `${detached.length} date(s) are separated from their title by more than a column ` +
      "gap, so the two are not read as one entry.",
    evidence: detached.slice(0, 5),
    measurements: { detached_dates: detached.length },
  });
}

/** contact.no_icon_glyphs — measured 0 across both oracles. */
export function checkNoIconGlyphs(
  doc: ResumeDocument,
  layouts = analyzeDocument(doc)
): AtsFinding {
  const contactLines = layouts.flatMap((layout) =>
    layout.lines.filter((line) => contactKinds(line.text).length)
  );
  if (!contactLines.length) {
    return finding(ID.contactIcons, {
      status: "not_applicable",
      detail: "No email, phone number or URL was found in the text layer.",
      measurements: { contact_lines: 0 },
    });
  }
  const withIcons = contactLines
    .map((line) => ({
      line,
      glyphs: [...new Set(line.text.match(/[←-⯿]/g) ?? [])],
    }))
    .filter((entry) => entry.glyphs.length);
  if (!withIcons.length) {
    return finding(ID.contactIcons, {
      status: "pass",
      detail: "Contact lines carry no icon glyphs.",
      measurements: { contact_lines: contactLines.length, icon_glyphs: 0 },
    });
  }
  const glyphs = [...new Set(withIcons.flatMap((entry) => entry.glyphs))];
  return finding(ID.contactIcons, {
    status: "fail",
    detail:
      `Contact lines contain icon glyphs (${glyphs.join(" ")}), which land in the ` +
      "extracted text as stray symbols.",
    evidence: withIcons.map((entry) => `page ${entry.line.page}: "${entry.line.text}"`),
    measurements: {
      contact_lines: contactLines.length,
      icon_glyphs: glyphs.length,
      glyphs: glyphs.join(""),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Running the set, and score assembly                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every deterministic check in the registry. The guard below asserts this list covers
 * all of them, so adding a deterministic check to the registry without implementing it
 * fails loudly rather than silently scoring as if it had passed.
 */
export const ATS_CHECKS: {
  id: string;
  run: (doc: ResumeDocument, layouts: PageLayout[]) => AtsFinding;
}[] = [
  { id: ID.headings, run: checkStandardSectionHeadings },
  { id: ID.contactMargin, run: checkContactInBody },
  { id: ID.onePage, run: checkSinglePage },
  { id: ID.singleColumn, run: checkSingleColumnReadingOrder },
  { id: ID.sidebar, run: checkSidebarReadingOrder },
  { id: ID.tables, run: checkNoTables },
  { id: ID.bullets, run: checkGlyphBullets },
  { id: ID.dateConsistency, run: (doc) => checkConsistentDateFormat(doc) },
  { id: ID.dateNumeric, run: (doc) => checkNumericMonthFormat(doc) },
  { id: ID.dateInline, run: checkInlineDates },
  { id: ID.contactIcons, run: checkNoIconGlyphs },
];

export const DETERMINISTIC_CHECK_IDS = ATS_REGISTRY.checks
  .filter((check) => check.layer === "deterministic")
  .map((check) => check.id);

const unimplemented = DETERMINISTIC_CHECK_IDS.filter(
  (id) => !ATS_CHECKS.some((check) => check.id === id)
);
if (unimplemented.length) {
  throw new Error(
    `registry has deterministic checks with no implementation: ${unimplemented.join(", ")}`
  );
}

/** Runs every deterministic check once, in registry order. */
export function runAtsChecks(doc: ResumeDocument): AtsFinding[] {
  const layouts = analyzeDocument(doc);
  const order = new Map(ATS_REGISTRY.checks.map((check, index) => [check.id, index]));
  return ATS_CHECKS.map((check) => check.run(doc, layouts)).sort(
    (a, b) => (order.get(a.check_id) ?? 0) - (order.get(b.check_id) ?? 0)
  );
}

/** What to do about each check, for the UI. Advice only — never a severity. */
const FIX_ADVICE: Record<string, { section: string | null; fix: string }> = {
  [ID.headings]: {
    section: "Section headings",
    fix:
      "Rename creative headings to the conventional words: Experience, Education, " +
      "Skills, Projects, Summary.",
  },
  [ID.contactMargin]: {
    section: "Contact",
    fix:
      "Move the contact line into the body of the document, directly under your name, " +
      "instead of the page header or footer.",
  },
  [ID.onePage]: {
    section: "Document",
    fix:
      "Cut the resume to a single page, or make sure no single role's details straddle " +
      "the page break.",
  },
  [ID.singleColumn]: {
    section: "Layout",
    fix:
      "Flow the whole resume in one column. Two columns are read in a different order " +
      "depending on the parser.",
  },
  [ID.sidebar]: {
    section: "Layout",
    fix: "Fold the sidebar's content into the main column so nothing sits side by side.",
  },
  [ID.tables]: {
    section: "Layout",
    fix: "Replace table layout with plain paragraphs and lists.",
  },
  [ID.bullets]: {
    section: "Experience",
    fix: "Use a real bullet glyph for list items instead of hyphens or asterisks.",
  },
  [ID.dateConsistency]: {
    section: "Dates",
    fix: "Pick one date format and use it for every entry.",
  },
  [ID.dateNumeric]: { section: "Dates", fix: "Write dates as MM/YYYY." },
  [ID.dateInline]: {
    section: "Experience",
    fix:
      "Put the date on its own line under the job title rather than right-aligned across " +
      "the page.",
  },
  [ID.contactIcons]: {
    section: "Contact",
    fix: "Delete the icon glyphs and write the contact details as plain text.",
  },
};

export function issueFromFinding(found: AtsFinding): ResumeIssue {
  const advice = FIX_ADVICE[found.check_id];
  return {
    check_id: found.check_id,
    severity: severityLabel(found.severity_points),
    severity_points: found.severity_points,
    confidence: found.confidence,
    category: found.category,
    section: advice?.section ?? null,
    problem: found.detail,
    fix: advice?.fix ?? found.statement,
    evidence: found.evidence,
    ...(found.caveat ? { caveat: found.caveat } : {}),
  };
}

/**
 * Score assembly. 100 minus the measured cost of every check that failed, per the
 * registry. Deterministic by construction: no model, no clock, no randomness, and the
 * only input is the findings list.
 */
export function assembleAtsScore(findings: AtsFinding[]): {
  ats_score: number;
  sub_scores: Partial<Record<AtsCategory, number | null>>;
} {
  const deducted = findings.reduce((sum, found) => sum + found.points_deducted, 0);

  const subScores: Partial<Record<AtsCategory, number | null>> = {};
  for (const found of findings) {
    if (found.status === "not_applicable") {
      if (!(found.category in subScores)) subScores[found.category] = null;
      continue;
    }
    const current = subScores[found.category];
    subScores[found.category] = Math.max(
      0,
      (typeof current === "number" ? current : 100) - found.points_deducted
    );
  }
  for (const category of Object.keys(subScores) as AtsCategory[]) {
    const value = subScores[category];
    if (typeof value === "number") subScores[category] = round(value);
  }

  return {
    ats_score: round(Math.max(0, Math.min(100, 100 - deducted))),
    sub_scores: subScores,
  };
}

/**
 * The structural audit of one resume.
 *
 * When the PDF carries no text at all there is nothing for these checks to read, so the
 * audit reports `no_text_layer` and no score, rather than a 100 assembled out of checks
 * that never ran. Telling the user to re-export a text PDF is the registry's
 * `parseability.text_layer_present` gate, which belongs to the caller.
 */
export function auditResumeStructure(doc: ResumeDocument): ResumeAudit {
  const findings = runAtsChecks(doc);
  const registry = {
    bench_run_at: ATS_REGISTRY.bench_run_at,
    flag_threshold_points: ATS_REGISTRY.flag_threshold_points,
    checks_run: findings.length,
  };

  if (!doc.items.length) {
    return {
      ats_score: null,
      status: "no_text_layer",
      sub_scores: {},
      issues: [],
      findings,
      registry,
    };
  }

  const { ats_score, sub_scores } = assembleAtsScore(findings);
  return {
    ats_score,
    status: "scored",
    sub_scores,
    issues: findings
      .filter((found) => found.status === "fail")
      .map(issueFromFinding)
      .sort((a, b) => b.severity_points - a.severity_points),
    findings,
    registry,
  };
}
