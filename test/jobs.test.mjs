import test from "node:test";
import assert from "node:assert/strict";
import { buildLinkedInJobSearchUrl, scoreJobsWithResume } from "../src/lib/jobs.ts";
import { generateJobsCsv } from "../src/lib/jobs-csv.ts";

test("buildLinkedInJobSearchUrl correctly parses filters into LinkedIn query params", () => {
  const url = buildLinkedInJobSearchUrl({
    keywords: "Full Stack Engineer",
    location: "San Francisco, CA",
    workplace_type: "remote",
    date_posted: "past_24h",
    experience_level: "senior",
  });

  assert.ok(url.startsWith("https://www.linkedin.com/jobs/search/?"));
  assert.ok(url.includes("keywords=Full+Stack+Engineer"));
  assert.ok(url.includes("location=San+Francisco%2C+CA"));
  assert.ok(url.includes("f_WT=2")); // Remote
  assert.ok(url.includes("f_TPR=r86400")); // 24 hours
  assert.ok(url.includes("f_E=4")); // Senior
});

test("scoreJobsWithResume computes match scores and identifies strengths and gaps", () => {
  const resume = {
    candidate_name: "Alex Morgan",
    target_roles: ["Full Stack Engineer"],
    extracted_skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
    years_of_experience: 5,
    seniority_level: "Senior",
    summary: "Senior dev",
    suggested_search_keywords: ["Full Stack Engineer"],
  };

  const sampleJobs = [
    {
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Stripe",
      location: "San Francisco, CA",
      workplace_type: "Remote",
      salary: "$160,000 - $195,000",
      posted_date: "2 hours ago",
      description: "Building scalable payment platforms",
      apply_url: "https://www.linkedin.com/jobs/view/123",
      skills_required: ["React", "TypeScript", "Node.js", "PostgreSQL", "Kafka"],
    },
    {
      id: "job-2",
      title: "iOS Mobile Engineer",
      company: "Apple",
      location: "Cupertino, CA",
      workplace_type: "On-site",
      salary: "$150,000 - $180,000",
      posted_date: "1 day ago",
      description: "Building native iOS apps in Swift",
      apply_url: "https://www.linkedin.com/jobs/view/456",
      skills_required: ["Swift", "Objective-C", "iOS SDK"],
    },
  ];

  const scored = scoreJobsWithResume(sampleJobs, resume);

  assert.equal(scored.length, 2);
  // Job 1 should be ranked higher due to matching React, TypeScript, Node.js, PostgreSQL
  assert.ok(scored[0].match_score > scored[1].match_score);
  assert.ok(scored[0].match_score >= 80);
  assert.ok(scored[0].missing_skills.includes("Kafka"));
  assert.ok(scored[0].match_reasons.length > 0);
});

test("generateJobsCsv formats job rows with RFC 4180 escaping and headers", () => {
  const sampleJobs = [
    {
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Stripe, Inc.",
      location: "Remote, US",
      workplace_type: "Remote",
      salary: "$160,000 - $190,000",
      posted_date: "Just posted",
      description: 'Exciting role with "high impact" projects.',
      apply_url: "https://www.linkedin.com/jobs/view/123",
      skills_required: ["React", "TypeScript"],
      match_score: 95,
      match_reasons: ["Matches React, TypeScript"],
      missing_skills: ["AWS"],
    },
  ];

  const csv = generateJobsCsv(sampleJobs);
  assert.match(csv, /"Job Title","Company","Match Score","Workplace Type","Location","Salary","Posted Date","Direct Apply Link"/);
  assert.match(csv, /"Senior Full Stack Engineer","Stripe, Inc.","95%","Remote","Remote, US"/);
  assert.match(csv, /""high impact""/);
});
