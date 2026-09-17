/**
 * Turns a parser's raw output into per-field probe scores against a fixture manifest.
 *
 * Each probe scores 0..1. A parser's accuracy on a fixture is the mean of its probes.
 * The probe SET is fixed per parser and identical across fixtures, so a parser's numbers
 * are comparable fixture to fixture; the two parsers are never compared to each other,
 * only each to its own baseline.
 */

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/ /g, " ")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const digits = (value) => String(value ?? "").replace(/\D/g, "");

const contains = (haystack, needle) => norm(haystack).includes(norm(needle));

/** 1 if `needle` appears anywhere in `haystack`, else 0. */
const found = (haystack, needle) => (needle && contains(haystack, needle) ? 1 : 0);

/** Fraction of `needles` that appear in `haystack`. */
const recall = (haystack, needles) => {
  if (!needles.length) return null;
  const hay = norm(haystack);
  const hits = needles.filter((needle) => hay.includes(norm(needle))).length;
  return hits / needles.length;
};

/** Phone match on digits only, so formatting differences do not count as a parse failure. */
const phoneScore = (actual, expected) => {
  const a = digits(actual);
  const e = digits(expected);
  if (!a || !e) return 0;
  // Expected "+91 988 765 4321" -> the 10 national digits are what a parser can be asked for.
  const tail = e.slice(-10);
  return a.includes(tail) || tail.includes(a.slice(-10)) ? 1 : 0;
};

/** Bullets are matched on a normalised prefix: enough to identify the bullet, tolerant of clipping. */
const bulletPrefixes = (content) =>
  content.work.flatMap((job) => job.bullets.map((b) => norm(b).slice(0, 40)));

// ---------------------------------------------------------------------------
// Oracle A: open-resume
// ---------------------------------------------------------------------------

export const scoreOpenResume = (output, expected, content) => {
  if (output?.__error__) {
    return { __error__: output.__error__, probes: zeroProbes(OPEN_RESUME_PROBES) };
  }

  const profile = output.profile ?? {};
  const work = output.workExperiences ?? [];
  const educations = output.educations ?? [];
  const skillsText = [
    ...(output.skills?.featuredSkills ?? []).map((s) => s.skill),
    ...(output.skills?.descriptions ?? []),
  ].join(" | ");
  const allDescriptions = [
    ...work.flatMap((job) => job.descriptions ?? []),
    ...educations.flatMap((edu) => edu.descriptions ?? []),
    ...(output.projects ?? []).flatMap((project) => project.descriptions ?? []),
  ].join(" | ");

  const companies = work.map((job) => job.company).join(" | ");
  const titles = work.map((job) => job.jobTitle).join(" | ");
  const dates = work.map((job) => job.date).join(" | ");

  return {
    probes: {
      name: found(profile.name, expected.name),
      email: found(profile.email, expected.email),
      phone: phoneScore(profile.phone, expected.phone),
      location: found(profile.location, expected.location),
      url: found(profile.url, expected.url),
      skills: recall(skillsText, expected.skills) ?? 0,
      work_companies: recall(companies, expected.work.map((w) => w.company)) ?? 0,
      work_titles: recall(titles, expected.work.map((w) => w.title)) ?? 0,
      work_dates: recall(dates, expected.work.map((w) => w.date)) ?? 0,
      education:
        (found(educations.map((e) => e.school).join(" | "), expected.education[0].school) +
          found(educations.map((e) => e.degree).join(" | "), expected.education[0].degree)) /
        2,
      bullets: recall(allDescriptions, bulletPrefixes(content)) ?? 0,
    },
  };
};

export const OPEN_RESUME_PROBES = [
  "name", "email", "phone", "location", "url", "skills",
  "work_companies", "work_titles", "work_dates", "education", "bullets",
];

// ---------------------------------------------------------------------------
// Oracle B: pdfminer.six + pyresparser extractors
// ---------------------------------------------------------------------------

/** The four semantic sections the bench asks oracle B to find, whatever they are called. */
const CANONICAL_SECTIONS = ["experience", "education", "skills", "projects"];

export const scorePyresparser = (output, expected, content) => {
  if (output?.__error__) {
    return { __error__: output.__error__, probes: zeroProbes(PYRESPARSER_PROBES) };
  }

  const text = output.text ?? "";
  const sections = output.sections ?? {};
  const sectionKeys = Object.keys(sections).map(norm);
  const experienceText = [
    ...(sections.experience ?? []),
    ...(output.experience_lines ?? []),
  ].join(" | ");
  const educationText = JSON.stringify(output.education ?? []);

  return {
    probes: {
      name: found(output.name, expected.name),
      email: found(output.email, expected.email),
      phone: phoneScore(output.phone, expected.phone),
      skills: recall((output.skills ?? []).join(" | "), expected.skills) ?? 0,
      sections:
        CANONICAL_SECTIONS.filter((section) => sectionKeys.includes(section)).length /
        CANONICAL_SECTIONS.length,
      work_entities:
        recall(experienceText, [
          ...expected.work.map((w) => w.company),
          ...expected.work.map((w) => w.title),
        ]) ?? 0,
      education: found(educationText, expected.education[0].degree.split(" in ")[0]),
      bullets: recall(text, bulletPrefixes(content)) ?? 0,
    },
  };
};

export const PYRESPARSER_PROBES = [
  "name", "email", "phone", "skills", "sections", "work_entities", "education", "bullets",
];

// ---------------------------------------------------------------------------

const zeroProbes = (names) => Object.fromEntries(names.map((name) => [name, 0]));

export const accuracy = (probes) => {
  const values = Object.values(probes);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
