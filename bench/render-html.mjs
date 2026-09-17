/**
 * Renders bench/content.json into fixture HTML, and computes the expected field values
 * for the matching manifest. One function, driven by render options, so that two
 * fixtures differ only where their options differ.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pad2 = (n) => String(n).padStart(2, "0");

/** Formats one {month, year} point in the requested style. */
const formatPoint = (point, style) => {
  if (!point) return "Present";
  switch (style) {
    case "monthYYYY":
      return `${MONTHS[point.month - 1]} ${point.year}`;
    case "shortMonthYYYY":
      return `${MONTHS[point.month - 1].slice(0, 3)} ${point.year}`;
    case "yearOnly":
      return `${point.year}`;
    case "mmYYYY":
    default:
      return `${pad2(point.month)}/${point.year}`;
  }
};

/**
 * "mixed" deliberately uses a different style per entry index - that is the dimension
 * under test. Every other format is applied uniformly.
 */
const styleForEntry = (dateFormat, index) => {
  if (dateFormat !== "mixed") return dateFormat;
  return ["mmYYYY", "shortMonthYYYY", "yearOnly"][index % 3];
};

export const formatRange = (entry, dateFormat, index) => {
  const style = styleForEntry(dateFormat, index);
  return `${formatPoint(entry.start, style)} - ${formatPoint(entry.end, style)}`;
};

const HEADINGS = {
  standard: {
    summary: "Summary",
    work: "Experience",
    education: "Education",
    projects: "Projects",
    skills: "Skills",
  },
  creative: {
    summary: "In A Nutshell",
    work: "Where I Made Impact",
    education: "How I Learned",
    projects: "Things I Built",
    skills: "What I Work With",
  },
};

const CONTACT_ICONS = {
  email: "✉",
  phone: "☎",
  location: "⌂",
  url: "⚭",
};

const contactLine = (c, options) => {
  const parts =
    options.contactStyle === "icons"
      ? [
          `${CONTACT_ICONS.email} ${c.email}`,
          `${CONTACT_ICONS.phone} ${c.phone}`,
          `${CONTACT_ICONS.location} ${c.location}`,
          `${CONTACT_ICONS.url} ${c.url}`,
        ]
      : [c.email, c.phone, c.location, c.url];
  return parts.map(esc).join(" | ");
};

const bulletList = (bullets) =>
  `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;

const workEntry = (job, options, index) => {
  const dates = formatRange(job, options.dateFormat, index);
  const breakBefore =
    options.pagination === "force2" && index === 2 ? ' style="break-before:page"' : "";

  if (options.experienceLayout === "table") {
    return `<table class="entry-table"${breakBefore}>
      <tr><td class="t-title">${esc(job.title)}</td><td class="t-date">${esc(dates)}</td></tr>
      <tr><td class="t-company">${esc(job.company)}</td><td></td></tr>
      <tr><td colspan="2">${bulletList(job.bullets)}</td></tr>
    </table>`;
  }

  const header =
    options.datePlacement === "right"
      ? `<div class="row"><span class="title">${esc(job.title)}</span><span class="date-right">${esc(dates)}</span></div>
         <div class="company">${esc(job.company)}</div>`
      : `<div class="title">${esc(job.title)}</div>
         <div class="company">${esc(job.company)}</div>
         <div class="date">${esc(dates)}</div>`;

  return `<div class="entry"${breakBefore}>${header}${bulletList(job.bullets)}</div>`;
};

const educationEntry = (edu, options, index) => {
  const dates = formatRange(edu, options.dateFormat, index);
  return `<div class="entry">
    <div class="title">${esc(edu.school)}</div>
    <div class="company">${esc(edu.degree)}</div>
    <div class="date">${esc(dates)} | GPA: ${esc(edu.gpa)}</div>
  </div>`;
};

const projectEntry = (project, options, index) => {
  const dates = formatRange(project, options.dateFormat, index);
  return `<div class="entry">
    <div class="title">${esc(project.name)}</div>
    <div class="date">${esc(dates)}</div>
    ${bulletList(project.bullets)}
  </div>`;
};

const skillsBlock = (skills, options) => {
  if (options.experienceLayout === "table") {
    const rows = [];
    for (let i = 0; i < skills.length; i += 4) {
      rows.push(
        `<tr>${skills.slice(i, i + 4).map((s) => `<td>${esc(s)}</td>`).join("")}</tr>`
      );
    }
    return `<table class="skills-table">${rows.join("")}</table>`;
  }
  return `<p class="skills">${skills.map(esc).join(", ")}</p>`;
};

/**
 * The margin-contact fixture zeroes the @page margin and moves the same 14mm inset onto
 * body padding, because Chrome clips a fixed element placed at a negative offset outside
 * the page content box. The body text block therefore lands in exactly the same place as
 * the baseline; the only thing that moves is the contact line, which is the point.
 */
const css = (options) => `
  @page { size: A4; margin: ${options.contactPlacement === "margin" ? "0" : "14mm"}; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.3;
         color: #111; margin: 0;
         padding: ${options.contactPlacement === "margin" ? "14mm" : "0"}; }
  h1 { font-size: 19pt; margin: 0 0 3pt 0; font-weight: bold; }
  h2 { font-size: 11.5pt; margin: 8pt 0 3pt 0; font-weight: bold;
       border-bottom: 0.7pt solid #444; padding-bottom: 1pt; }
  p { margin: 0 0 3pt 0; }
  ul { margin: 2pt 0 4pt 0; padding-left: 13pt; list-style-type: ${
    options.bullet === "hyphen" ? `"- "` : `"\\2022  "`
  }; }
  li { margin: 0 0 1.5pt 0; }
  .contact { margin: 0 0 2pt 0; }
  .entry { margin: 0 0 8pt 0; }
  .title { font-weight: bold; }
  .company { font-style: italic; }
  .date { color: #333; }
  .row { display: flex; justify-content: space-between; }
  .date-right { text-align: right; }
  .entry-table { width: 100%; border-collapse: collapse; margin: 0 0 5pt 0; }
  .entry-table td { vertical-align: top; padding: 0; }
  .t-title { font-weight: bold; }
  .t-company { font-style: italic; }
  .t-date { text-align: right; width: 32%; }
  .skills-table { width: 100%; border-collapse: collapse; }
  .skills-table td { padding: 0 6pt 1pt 0; }
  .body-columns { column-count: ${options.columns}; column-gap: 9mm; }
  .margin-contact { position: fixed; top: 4mm; left: 0; right: 0; text-align: center;
                    font-size: 9pt; }
  .layout { display: flex; gap: 8mm; }
  .sidebar { width: 30%; }
  .main { width: 70%; }
`;

/** Builds the fixture HTML and the expected values that scoring compares against. */
export const renderFixture = (content, options) => {
  const h = HEADINGS[options.headings];
  const contact = contactLine(content, options);

  const header = `
    <h1>${esc(content.name)}</h1>
    ${options.contactPlacement === "margin" ? "" : `<div class="contact">${contact}</div>`}
  `;

  const summarySection = `<h2>${esc(h.summary)}</h2><p>${esc(content.summary)}</p>`;
  const workSection = `<h2>${esc(h.work)}</h2>${content.work
    .map((job, i) => workEntry(job, options, i))
    .join("")}`;
  const educationSection = `<h2>${esc(h.education)}</h2>${content.education
    .map((edu, i) => educationEntry(edu, options, i))
    .join("")}`;
  const projectSection = `<h2>${esc(h.projects)}</h2>${content.projects
    .map((p, i) => projectEntry(p, options, i))
    .join("")}`;
  const skillsSection = `<h2>${esc(h.skills)}</h2>${skillsBlock(content.skills, options)}`;

  let bodyInner;
  if (options.sidebar) {
    bodyInner = `<div class="layout">
      <div class="sidebar">${skillsSection}</div>
      <div class="main">${summarySection}${workSection}${educationSection}${projectSection}</div>
    </div>`;
  } else {
    const flow = `${summarySection}${workSection}${educationSection}${projectSection}${skillsSection}`;
    bodyInner = options.columns > 1 ? `<div class="body-columns">${flow}</div>` : flow;
  }

  const marginContact =
    options.contactPlacement === "margin"
      ? `<div class="margin-contact">${contact}</div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(content.name)}</title>
<style>${css(options)}</style></head>
<body>${marginContact}${header}${bodyInner}</body></html>`;

  const expected = {
    name: content.name,
    email: content.email,
    phone: content.phone,
    location: content.location,
    url: content.url,
    skills: content.skills,
    sections: Object.values(h),
    work: content.work.map((job, i) => ({
      company: job.company,
      title: job.title,
      date: formatRange(job, options.dateFormat, i),
    })),
    education: content.education.map((edu, i) => ({
      school: edu.school,
      degree: edu.degree,
      date: formatRange(edu, options.dateFormat, i),
    })),
  };

  return { html, expected };
};
