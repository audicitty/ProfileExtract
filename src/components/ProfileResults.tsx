"use client";

import { useState } from "react";
import { ProfileData } from "@/lib/types";
import { downloadProfileCsv } from "@/lib/csv";
import {
  Download,
  Copy,
  Check,
  Briefcase,
  GraduationCap,
  Award,
  FolderGit2,
  MapPin,
  Building2,
  User,
  Sparkles,
  Table as TableIcon,
  LayoutGrid,
} from "lucide-react";

interface ProfileResultsProps {
  profile: ProfileData;
  onReset?: () => void;
}

export function ProfileResults({ profile, onReset }: ProfileResultsProps) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const fullName = `${profile.first_name} ${profile.last_name}`.trim() || "Profile Overview";

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCsv = () => {
    downloadProfileCsv(profile);
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Top Action & Export Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <Sparkles className="h-3 w-3" /> Structured
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Parsed directly from raw text &bull; Ready for export
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                viewMode === "table"
                  ? "bg-white text-[#0f4c81] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Tabular View</span>
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                viewMode === "cards"
                  ? "bg-white text-[#0f4c81] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards View</span>
            </button>
          </div>

          <button
            onClick={handleCopyJson}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f4c81]"
            title="Copy structured JSON to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Copied JSON</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                <span>Copy JSON</span>
              </>
            )}
          </button>

          <button
            onClick={() => downloadProfileCsv(profile)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0f4c81] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a365c] focus:outline-none focus:ring-2 focus:ring-[#0f4c81] focus:ring-offset-1"
            title="Download structured spreadsheet (Excel / Google Sheets compatible)"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE: TABULAR */}
      {viewMode === "table" ? (
        <div className="space-y-6">
          {/* 1. Master Overview Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#0f4c81]" />
                <h3 className="text-sm font-semibold text-slate-900">Profile Overview</h3>
              </div>
              <span className="text-[11px] font-medium text-slate-500">Core Attributes</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="px-5 py-2.5 w-44">Attribute</th>
                    <th className="px-5 py-2.5">Extracted Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr className="hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 font-medium text-slate-900 bg-slate-50/30">Full Name</td>
                    <td className="px-5 py-2.5 font-semibold text-slate-900">{fullName}</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 font-medium text-slate-900 bg-slate-50/30">Headline</td>
                    <td className="px-5 py-2.5 text-slate-800">{profile.headline || "—"}</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 font-medium text-slate-900 bg-slate-50/30">Current Role & Company</td>
                    <td className="px-5 py-2.5">
                      {profile.current_title || profile.current_company ? (
                        <span>
                          <strong className="text-slate-900">{profile.current_title || "Role"}</strong>
                          {profile.current_company && <span> at {profile.current_company}</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 font-medium text-slate-900 bg-slate-50/30">Location</td>
                    <td className="px-5 py-2.5">{profile.location || "—"}</td>
                  </tr>
                  {profile.about && (
                    <tr className="hover:bg-slate-50/50">
                      <td className="px-5 py-2.5 font-medium text-slate-900 bg-slate-50/30 align-top">About</td>
                      <td className="px-5 py-2.5 text-slate-600 whitespace-pre-line leading-relaxed">
                        {profile.about}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Experience Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#0f4c81]" />
                <h3 className="text-sm font-semibold text-slate-900">Work Experience Table</h3>
              </div>
              <span className="text-[11px] font-medium text-slate-500">
                {profile.experience?.length || 0} position{profile.experience?.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5 w-12 text-center">#</th>
                    <th className="px-4 py-2.5 w-48">Company</th>
                    <th className="px-4 py-2.5 w-56">Job Title</th>
                    <th className="px-4 py-2.5 w-40">Duration</th>
                    <th className="px-4 py-2.5">Key Responsibilities / Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {profile.experience && profile.experience.length > 0 ? (
                    profile.experience.map((exp, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-center font-medium text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{exp.company || "—"}</td>
                        <td className="px-4 py-3 font-medium text-[#0f4c81]">{exp.title || "—"}</td>
                        <td className="px-4 py-3">
                          {exp.duration ? (
                            <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              {exp.duration}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-pre-line leading-relaxed">
                          {exp.description || "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400 italic">
                        No work experience records found in the pasted text.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Education Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[#0f4c81]" />
                <h3 className="text-sm font-semibold text-slate-900">Education Table</h3>
              </div>
              <span className="text-[11px] font-medium text-slate-500">
                {profile.education?.length || 0} institution{profile.education?.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5 w-12 text-center">#</th>
                    <th className="px-4 py-2.5">Institution / School</th>
                    <th className="px-4 py-2.5">Degree / Field of Study</th>
                    <th className="px-4 py-2.5 w-40">Years Attended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {profile.education && profile.education.length > 0 ? (
                    profile.education.map((edu, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-center font-medium text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{edu.school || "—"}</td>
                        <td className="px-4 py-3 text-slate-700">{edu.degree || "—"}</td>
                        <td className="px-4 py-3">
                          {edu.years ? (
                            <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              {edu.years}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400 italic">
                        No education records found in the pasted text.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Projects & Certifications Tables Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Projects Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="text-sm font-semibold text-slate-900">Projects Table</h3>
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  {profile.projects?.length || 0} project{profile.projects?.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2.5 w-44">Project Name</th>
                      <th className="px-4 py-2.5">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {profile.projects && profile.projects.length > 0 ? (
                      profile.projects.map((proj, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-900 align-top">{proj.name}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-pre-line leading-relaxed">
                            {proj.description || "—"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-400 italic">
                          No projects found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Certifications Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="text-sm font-semibold text-slate-900">Certifications Table</h3>
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  {profile.certifications?.length || 0} item{profile.certifications?.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2.5">Certification</th>
                      <th className="px-4 py-2.5">Issuer</th>
                      <th className="px-4 py-2.5 w-32">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {profile.certifications && profile.certifications.length > 0 ? (
                      profile.certifications.map((cert, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{cert.name}</td>
                          <td className="px-4 py-3 text-slate-600">{cert.issuer || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{cert.date || "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic">
                          No certifications found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 5. Skills Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Skills &amp; Technologies</h3>
              <span className="text-[11px] font-medium text-slate-500">
                {profile.skills?.length || 0} skills identified
              </span>
            </div>
            <div className="p-5">
              {profile.skills && profile.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No skills listed in profile text.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* VIEW MODE: CARDS */
        <div className="space-y-6">
          {/* 1. Overview Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-400" />
                  <h3 className="text-lg font-bold text-slate-900">{fullName}</h3>
                </div>

                {profile.headline && (
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">
                    {profile.headline}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-slate-600">
                  {profile.current_title && (
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                      <span>{profile.current_title}</span>
                    </div>
                  )}

                  {profile.current_company && (
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>{profile.current_company}</span>
                    </div>
                  )}

                  {profile.location && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{profile.location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {profile.about && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  About
                </h4>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {profile.about}
                </p>
              </div>
            )}
          </div>

          {/* 2. Experience & Education Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Work Experience */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="font-semibold text-slate-900 text-sm">Experience</h3>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {profile.experience?.length || 0} role{profile.experience?.length === 1 ? "" : "s"}
                </span>
              </div>

              {profile.experience && profile.experience.length > 0 ? (
                <div className="space-y-4">
                  {profile.experience.map((exp, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-100 bg-slate-50/50 p-3.5 text-xs transition hover:border-slate-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                        <div>
                          <h4 className="font-semibold text-slate-900 text-sm">
                            {exp.title || "Position"}
                          </h4>
                          <p className="font-medium text-slate-700">{exp.company}</p>
                        </div>
                        {exp.duration && (
                          <span className="inline-block rounded bg-white px-2 py-0.5 font-medium text-slate-500 border border-slate-200 text-[11px] self-start">
                            {exp.duration}
                          </span>
                        )}
                      </div>
                      {exp.description && (
                        <p className="mt-2.5 text-slate-600 whitespace-pre-line leading-relaxed text-xs border-t border-slate-100/80 pt-2">
                          {exp.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No experience entries found in text.</p>
              )}
            </div>

            {/* Education */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="font-semibold text-slate-900 text-sm">Education</h3>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {profile.education?.length || 0} institution{profile.education?.length === 1 ? "" : "s"}
                </span>
              </div>

              {profile.education && profile.education.length > 0 ? (
                <div className="space-y-4">
                  {profile.education.map((edu, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-100 bg-slate-50/50 p-3.5 text-xs transition hover:border-slate-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                        <div>
                          <h4 className="font-semibold text-slate-900 text-sm">
                            {edu.school || "Institution"}
                          </h4>
                          <p className="text-slate-700 font-medium">{edu.degree}</p>
                        </div>
                        {edu.years && (
                          <span className="inline-block rounded bg-white px-2 py-0.5 font-medium text-slate-500 border border-slate-200 text-[11px] self-start">
                            {edu.years}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No education entries found in text.</p>
              )}
            </div>
          </div>

          {/* 3. Projects & Certifications Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Projects */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="font-semibold text-slate-900 text-sm">Projects</h3>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {profile.projects?.length || 0}
                </span>
              </div>

              {profile.projects && profile.projects.length > 0 ? (
                <div className="space-y-3">
                  {profile.projects.map((proj, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      <h4 className="font-semibold text-slate-900">{proj.name}</h4>
                      {proj.description && (
                        <p className="mt-1 text-slate-600 whitespace-pre-line leading-relaxed">
                          {proj.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No projects found in text.</p>
              )}
            </div>

            {/* Certifications */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="font-semibold text-slate-900 text-sm">Certifications</h3>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {profile.certifications?.length || 0}
                </span>
              </div>

              {profile.certifications && profile.certifications.length > 0 ? (
                <div className="space-y-3">
                  {profile.certifications.map((cert, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs"
                    >
                      <div>
                        <h4 className="font-semibold text-slate-900">{cert.name}</h4>
                        <p className="text-slate-600">{cert.issuer}</p>
                      </div>
                      {cert.date && (
                        <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 border border-slate-200 shrink-0">
                          {cert.date}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No certifications found in text.</p>
              )}
            </div>
          </div>

          {/* 4. Skills Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-semibold text-slate-900 text-sm">Skills &amp; Endorsements</h3>
              <span className="text-xs font-medium text-slate-400">
                {profile.skills?.length || 0} skills
              </span>
            </div>

            {profile.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No skills listed in profile text.</p>
            )}
          </div>
        </div>
      )}

      {/* Reset CTA */}
      {onReset && (
        <div className="flex justify-center pt-2 pb-6">
          <button
            onClick={onReset}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 transition underline underline-offset-4"
          >
            &uarr; Structure another profile
          </button>
        </div>
      )}
    </div>
  );
}

