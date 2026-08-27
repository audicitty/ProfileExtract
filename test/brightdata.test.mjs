import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrightDataDirect } from "../src/lib/brightdata.ts";

test("normalizeBrightDataDirect accurately maps all Bright Data fields including fallbacks", () => {
  const sampleData = {
    first_name: "Satya",
    last_name: "Nadella",
    about: "Chairman and CEO of Microsoft. Empowering organizations globally.",
    current_company: {
      name: "Microsoft",
      title: "Chairman and CEO",
    },
    current_company_name: "Microsoft",
    educations_details: "The University of Chicago Booth School of Business",
    education: [
      {
        title: "The University of Chicago Booth School of Business",
        start_year: "1994",
        end_year: "1996",
      },
    ],
    posts: [
      {
        title: "How do we build a frontier intelligence ecosystem?",
        attribution: "Great to be back at Microsoft Build today.",
      },
    ],
    honors_and_awards: [
      {
        title: "Honorary Doctor of Science",
        issuer: "Georgia Tech",
        date: "2023",
      },
    ],
    skills: ["Cloud Computing", "AI", "Strategic Leadership"],
  };

  const normalized = normalizeBrightDataDirect(sampleData);

  assert.equal(normalized.first_name, "Satya");
  assert.equal(normalized.last_name, "Nadella");
  assert.equal(normalized.current_company, "Microsoft");
  assert.equal(normalized.current_title, "Chairman and CEO");
  assert.equal(normalized.headline, "Chairman and CEO at Microsoft");
  assert.equal(normalized.experience.length, 1);
  assert.equal(normalized.experience[0].company, "Microsoft");
  assert.equal(normalized.experience[0].title, "Chairman and CEO");
  assert.equal(normalized.education.length, 1);
  assert.equal(normalized.education[0].school, "The University of Chicago Booth School of Business");
  assert.equal(normalized.projects.length, 1);
  assert.equal(normalized.projects[0].name, "How do we build a frontier intelligence ecosystem?");
  assert.equal(normalized.certifications.length, 1);
  assert.equal(normalized.skills.length, 3);
});
