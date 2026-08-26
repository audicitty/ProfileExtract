import test from "node:test";
import assert from "node:assert/strict";
import { escapeCsvCell, generateProfileCsv } from "../src/lib/csv.ts";

test("escapeCsvCell handles simple strings", () => {
  assert.equal(escapeCsvCell("John Doe"), '"John Doe"');
});

test("escapeCsvCell escapes quotes and wraps in quotes", () => {
  assert.equal(escapeCsvCell('He said "Hello"'), '"He said ""Hello"""');
});

test("escapeCsvCell handles commas, newlines, and nulls", () => {
  assert.equal(escapeCsvCell("San Francisco, CA"), '"San Francisco, CA"');
  assert.equal(escapeCsvCell("Line 1\nLine 2"), '"Line 1\nLine 2"');
  assert.equal(escapeCsvCell(null), '""');
  assert.equal(escapeCsvCell(undefined), '""');
});

test("generateProfileCsv formats standard flat single-header CSV correctly", () => {
  const sampleProfile = {
    first_name: "Sarah",
    last_name: "Jenkins",
    headline: "Lead AI Research Engineer",
    current_company: "Anthropic",
    current_title: "Lead AI Engineer",
    location: "San Francisco, CA",
    about: "AI researcher specializing in distributed ML.",
    education: [
      { school: "Stanford", degree: "Ph.D. CS", years: "2015 - 2019" }
    ],
    experience: [
      {
        company: "Anthropic",
        title: "Lead AI Engineer",
        duration: "2022 - Present",
        description: "Leading ML systems & inference."
      }
    ],
    projects: [
      { name: "OpenTensor", description: "Fast inference engine" }
    ],
    certifications: [
      { name: "AWS Solutions Architect", issuer: "AWS", date: "2022" }
    ],
    skills: ["Python", "PyTorch", "Distributed Systems"]
  };

  const csv = generateProfileCsv(sampleProfile);
  assert.match(csv, /"First Name","Last Name","Full Name","Headline","Current Title","Current Company","Location"/);
  assert.match(csv, /"Sarah","Jenkins","Sarah Jenkins","Lead AI Research Engineer","Lead AI Engineer","Anthropic","San Francisco, CA"/);
  assert.match(csv, /"Python; PyTorch; Distributed Systems"/);
  assert.match(csv, /"1. Lead AI Engineer at Anthropic/);
  assert.match(csv, /"1. Stanford - Ph.D. CS/);
});
