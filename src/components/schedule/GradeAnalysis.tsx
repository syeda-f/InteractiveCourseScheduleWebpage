import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { type Grade, type GradeRecord } from "./gradeData";
import { sectionGradeData, type SectionGradeRecord } from "./sectionGradeData";
import { collegeProfessors, findProfessorEmail } from "./collegeProfessors";
import { canonicalCourseTitle } from "./scheduleImport";

type DisplayMode = "Student Count" | "Percentage";
type ReportMode = "course" | "section";
type GradeRangeOption = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D" | "F" | "W";
type ChartSeries = Pick<GradeRecord, "department" | "course" | "title" | "campus" | "totalStudents" | "grades"> & { label: string; section?: string; instructor?: string; colorIndex?: number };
type SemesterComparisonRecord = {
  semester: string;
  label: string;
  color: string;
  totalStudents: number;
  grades: Record<Grade, number>;
};

const grades: Grade[] = ["A+", "A", "B+", "B", "C+", "C", "D+", "D&Below", "W"];
const allGrades: Grade[] = [...grades, "P"];
const gradeColors = ["#258C70", "#34805B", "#3E78CE", "#315FC5", "#D17829", "#B86428", "#D75A2B", "#C73C3C", "#7E6C91"];
const sectionColors = ["#2E78A4", "#D85E9C"];
const semesterColors = ["#4055D6", "#E67E3F", "#258C70", "#A04B8B", "#C44545", "#2E78A4", "#8A6A2F", "#5C6BC0"];
const semesterLabels: Record<string, string> = { "202510": "Fall 2025" };
const semesterLabel = (code: string) => semesterLabels[code] ?? code;
const gradeLabels: Record<Exclude<Grade, "P">, string> = {
  "A+": "A+",
  A: "A",
  "B+": "B+",
  B: "B",
  "C+": "C+",
  C: "C",
  "D+": "D+",
  "D&Below": "D & F",
  W: "W",
};
const comparisonGradeLabel = (grade: Grade) => grade === "D&Below" ? "D & Below" : gradeLabels[grade as Exclude<Grade, "P">];

const total = (record: GradeRecord) => record.totalStudents;
const percent = (count: number, record: GradeRecord) => record.totalStudents ? (count / record.totalStudents) * 100 : 0;
const highGrades = (record: GradeRecord) => record.grades["A+"] + record.grades.A;
const passingGrades = (record: GradeRecord) => record.grades["A+"] + record.grades.A + record.grades["B+"] + record.grades.B + record.grades["C+"] + record.grades.C + record.grades.P + record.grades["D+"];
const passingRate = (record: GradeRecord) => percent(passingGrades(record), record);
const gradeRangeCount = (record: GradeRecord, range: GradeRangeOption[]) => {
  let count = range.reduce((sum, grade) => {
    if (grade === "D" || grade === "F") return sum;
    return sum + record.grades[grade as Grade];
  }, 0);
  if (range.includes("D") || range.includes("F")) count += record.grades["D&Below"];
  return count;
};
const campusName = (record: GradeRecord) => record.campus.replace(" Campus", "");
const cohortKey = (record: GradeRecord | SectionGradeRecord) => `${"semester" in record ? record.semester : ""}|${record.course}|${record.title}|${record.campus}|${"section" in record ? record.section : ""}`;
const campusColor = (record: GradeRecord) => record.campus === "Male Campus" ? sectionColors[0] : sectionColors[1];
const chartSeriesColor = (record: ChartSeries) => {
  if (!record.section) return campusColor(record);
  const maleColors = ["#123B73", "#B8DAFF", "#2C6FB2", "#DCEEFF", "#184F8C", "#8FC5F7"];
  const femaleColors = ["#7A174F", "#F7B5D8", "#A82E71", "#FFD9EC", "#C34C8D", "#E88BBB"];
  const palette = record.campus === "Male Campus" ? maleColors : femaleColors;
  return palette[(record.colorIndex ?? 0) % palette.length];
};
/** One chart/report section per semester, course, campus and section number.
 * Source rows are additive grade groups, not duplicate copies.
 * Do not combine across semesters, courses or campuses.
 */
function combineSectionGradeRows(records: SectionGradeRecord[]): SectionGradeRecord[] {
  const grouped = new Map<string, SectionGradeRecord>();
  const instructors = new Map<string, Set<string>>();
  for (const record of records) {
    const key = JSON.stringify([record.semester, record.course.trim().toUpperCase(), record.campus, record.section.trim()]);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...record, grades: { ...record.grades } });
      instructors.set(key, new Set(record.instructor && record.instructor !== "Unassigned" ? [record.instructor] : []));
      continue;
    }
    // Different grade rows for the same section represent different students.
    current.totalStudents += record.totalStudents;
    allGrades.forEach((grade) => { current.grades[grade] += record.grades[grade]; });
    if (record.instructor && record.instructor !== "Unassigned") instructors.get(key)!.add(record.instructor);
  }
  grouped.forEach((record, key) => {
    const names = [...(instructors.get(key) ?? [])];
    record.instructor = names.length ? names.join(" / ") : "Unassigned";
  });
  return [...grouped.values()];
}

const sectionKey = (record: SectionGradeRecord) => `${record.semester}|${record.campus}|${record.course}|${record.section}`;
const sectionLabel = (record: SectionGradeRecord) => `Section ${record.section} · ${record.campus.replace(" Campus", "")}`;
const chartSeriesKey = (record: ChartSeries) => `${"semester" in record ? record.semester : ""}|${record.course}|${record.campus}|${record.section ?? ""}|${record.instructor ?? ""}`;
const normalizeHeading = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9+]/g, "");
const normalizeTitle = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const canonicalCrossListedCodes: Record<string, string> = {
  operatingsystems: "COSC 4361",
  systemsprogramming: "ITAP 3411",
  cloudcomputing: "ITAP 4315",
  ecommerce: "SOEN 4371",
  algorithms: "COSC 3351",
  computernetworks: "COEN 3361",
  webprogramming: "SOEN 2312",
  programminglanguages: "COSC 4461",
  networksecurity: "CSEC 3431",
  networkmanagement: "ITAP 2431",
};
const officialProfessorNames = Object.values(collegeProfessors).flat();
const professorNameMap = new Map(officialProfessorNames.map((name) => [name.trim().toLowerCase(), name]));
const uniformProfessorName = (name: string) => professorNameMap.get(name.trim().toLowerCase()) ?? name.trim();
const uniformGradeRecord = (record: SectionGradeRecord): SectionGradeRecord => ({
  ...record,
  title: canonicalCourseTitle(record.course, record.title),
  instructor: uniformProfessorName(record.instructor),
});

function parseGradeDataset(file: File, data: ArrayBuffer): SectionGradeRecord[] {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) => row.some((cell) => {
    const heading = normalizeHeading(cell);
    return heading === "coursecode" || heading === "course";
  }));
  if (headerIndex < 0) throw new Error("The file does not contain a recognizable course header.");
  const headers = rows[headerIndex].map(normalizeHeading);
  const find = (...aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const prefixIndex = find("coursecode", "department", "prefix");
  const courseIndex = find("course", "coursenumber", "courseno");
  const sectionIndex = find("section", "sectionno", "sectionnumber");
  const titleIndex = find("coursetitle", "title");
  const instructorIndex = find("instructorname", "instructor");
  const totalIndex = find("totalnoofstudents", "totalstudents", "students", "total");
  const campusIndex = find("campus");
  const semesterIndex = find("semester", "term", "termcode");
  const gradeIndexes: Record<Grade, number> = {
    "A+": find("a+"),
    A: find("a"),
    "B+": find("b+"),
    B: find("b"),
    "C+": find("c+"),
    C: find("c"),
    P: find("p"),
    "D+": find("d+"),
    "D&Below": find("d&below", "dbelow", "dandbelow", "df"),
    W: find("w", "withdrawra", "withdrawal", "withdrawals"),
  };
  if (prefixIndex < 0 || sectionIndex < 0 || titleIndex < 0) {
    throw new Error("The file is missing required course, section, or title columns.");
  }
  const numberValue = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const filenameCampus = /female/i.test(file.name) ? "Female Campus" : /male/i.test(file.name) ? "Male Campus" : null;
  const records = rows.slice(headerIndex + 1).flatMap((row) => {
    const prefixValue = String(row[prefixIndex] ?? "").trim();
    const courseValue = courseIndex >= 0 ? String(row[courseIndex] ?? "").trim() : "";
    const course = /\d/.test(prefixValue) ? prefixValue : `${prefixValue} ${courseValue}`.trim();
    const section = String(row[sectionIndex] ?? "").trim();
    const title = String(row[titleIndex] ?? "").trim();
    if (!course || !section || !title || !/\d/.test(course)) return [];
    const grades = Object.fromEntries(allGrades.map((grade) => [
      grade,
      gradeIndexes[grade] >= 0 ? numberValue(row[gradeIndexes[grade]]) : 0,
    ])) as Record<Grade, number>;
    const campusValue = campusIndex >= 0 ? String(row[campusIndex] ?? "") : "";
    const campus = /female|^f$/i.test(campusValue)
      ? "Female Campus"
      : /male|^m$/i.test(campusValue)
        ? "Male Campus"
        : filenameCampus ?? (section.startsWith("2") ? "Female Campus" : "Male Campus");
    const department = course.split(/\s+/)[0];
    const gradeTotal = allGrades.reduce((sum, grade) => sum + grades[grade], 0);
    return [{
      semester: semesterIndex >= 0 ? String(row[semesterIndex] || "202510") : "202510",
      department,
      course,
      section,
      title: canonicalCourseTitle(course, title),
      instructor: uniformProfessorName(instructorIndex >= 0 ? String(row[instructorIndex] || "Unassigned") : "Unassigned"),
      campus,
      totalStudents: totalIndex >= 0 ? numberValue(row[totalIndex]) : gradeTotal,
      grades,
    } satisfies SectionGradeRecord];
  });
  return records.map(uniformGradeRecord);
}
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://pmu-data-analysis-portal-dap.onrender.com";

type BackendGradeRow = Record<string, unknown>;

function backendToSection(record: BackendGradeRow): SectionGradeRecord {
  const string = (key: string) => String(record[key] ?? "").trim();
  const number = (key: string) => Number(record[key] ?? 0) || 0;
  const course = string("course_code");
  const campusValue = string("campus").toLowerCase();
  const campus = campusValue.startsWith("f") ? "Female Campus" : "Male Campus";
  return {
    semester: string("term_code") || "202510",
    department: course.split(/\s+/)[0] || string("department"),
    course,
    section: string("section_number"),
    title: string("course_title"),
    instructor: string("instructor") || "Unassigned",
    campus,
    totalStudents: number("total_students"),
    grades: {
      "A+": number("A+"), A: number("A"), "B+": number("B+"),
      B: number("B"), "C+": number("C+"), C: number("C"),
      P: number("P"), "D+": number("D+"),
      "D&Below": number("D&Below"), W: number("withdraw_count"),
    },
  };
}

async function requestGradeSections(merged: boolean): Promise<SectionGradeRecord[]> {
  const response = await fetch(`${API_BASE}/api/grades?merge=${merged}&record_type=section`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Unable to load grades (${response.status}).`);
  }
  const rows: BackendGradeRow[] = await response.json();
  return rows.map(backendToSection);
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const xmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  data.forEach((byte) => { crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
};

const createDocxBlob = (lines: string[]) => {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  const entries = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", content: documentXml },
  ];
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const blobParts = [...localParts, ...centralParts, end].map((part) =>
    part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
  );
  return new Blob(blobParts, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
};

const createPdfBlob = (sourceLines: string[]) => {
  const clean = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "-").replace(/([\\()])/g, "\\$1");
  const pages = Array.from({ length: Math.max(1, Math.ceil(sourceLines.length / 48)) }, (_, index) => sourceLines.slice(index * 48, (index + 1) * 48));
  const fontId = 3 + pages.length * 2;
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((lines, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const stream = `BT /F1 10 Tf 44 790 Td 14 TL ${lines.map((line) => `(${clean(line)}) Tj T*`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
};

function MiniIcon({ name }: { name: "upload" | "download" | "users" | "sections" | "award" | "alert" | "check" | "chart" }) {
  const paths = {
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 15v4h16v-4" /></>,
    download: <><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" /><path d="M4 17v3h16v-3" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5.5a3 3 0 0 1 0 5.5M17 14c2.7.4 4 2.4 4 5" /></>,
    sections: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16" /></>,
    award: <><circle cx="12" cy="9" r="5" /><path d="m8.5 13-1 8 4.5-2 4.5 2-1-8" /></>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function GradeStat({ icon, label, value, note, warning = false }: { icon: "users" | "sections" | "award" | "alert"; label: string; value: string; note: string; warning?: boolean }) {
  return (
    <div className={`grade-stat ${warning ? "grade-stat--warning" : ""}`}>
      <div className="grade-stat__icon"><MiniIcon name={icon} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </div>
  );
}

function MetricToggle({ mode, onChange }: { mode: DisplayMode; onChange: (mode: DisplayMode) => void }) {
  return <div className="grade-chart-metric" aria-label="Chart display metric">{(["Student Count", "Percentage"] as DisplayMode[]).map((option) => <button className={mode === option ? "active" : ""} onClick={() => onChange(option)} key={option}>{option === "Student Count" ? "# Student Count" : "% Percentage"}</button>)}</div>;
}

function GradeRangeSelect({ values, options, onChange }: { values: GradeRangeOption[]; options: GradeRangeOption[]; onChange: (values: GradeRangeOption[]) => void }) {
  return <details className="grade-range-select"><summary>{values.length} grades selected</summary><div>{options.map((option) => <label key={option}><input type="checkbox" checked={values.includes(option)} onChange={() => onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option])} /><span>{option}</span></label>)}</div></details>;
}

function SemesterComparisonChart({
  data,
  mode,
  selectedGrades,
}: {
  data: SemesterComparisonRecord[];
  mode: DisplayMode;
  selectedGrades: Grade[];
}) {
  const width = 920;
  const height = 310;
  const padding = { top: 22, right: 26, bottom: 52, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const valueFor = (record: SemesterComparisonRecord, grade: Grade) => mode === "Percentage"
    ? (record.totalStudents ? record.grades[grade] / record.totalStudents * 100 : 0)
    : record.grades[grade];
  const rawMaximum = Math.max(0, ...data.flatMap((record) => selectedGrades.map((grade) => valueFor(record, grade))));
  const maximum = mode === "Percentage"
    ? Math.max(10, Math.min(100, Math.ceil(rawMaximum / 10) * 10))
    : Math.max(5, Math.ceil(rawMaximum / 5) * 5);
  const xPosition = (index: number) => padding.left + (data.length === 1 ? plotWidth / 2 : index / (data.length - 1) * plotWidth);
  const yPosition = (value: number) => padding.top + plotHeight - value / maximum * plotHeight;
  const ticks = [0, 1, 2, 3, 4];

  return (
    <div className="grade-semester-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Selected course grade distribution by semester">
        <text x={-height / 2} y="15" transform="rotate(-90)" textAnchor="middle" className="grade-semester-chart__axis-label">{mode}</text>
        {ticks.map((tick) => {
          const value = maximum * tick / 4;
          const y = yPosition(value);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="grade-semester-chart__grid" />
              <text x={padding.left - 10} y={y + 3} textAnchor="end" className="grade-semester-chart__tick">
                {mode === "Percentage" ? `${value.toFixed(0)}%` : Math.round(value)}
              </text>
            </g>
          );
        })}
        {data.map((record, index) => {
          const x = xPosition(index);
          return (
            <g key={record.semester}>
              <line x1={x} x2={x} y1={padding.top} y2={padding.top + plotHeight} className="grade-semester-chart__semester-line" style={{ stroke: record.color }} />
              <circle cx={x} cy={padding.top + plotHeight} r="4.5" fill={record.color} />
              <text x={x} y={height - 25} textAnchor="middle" className="grade-semester-chart__semester" style={{ fill: record.color }}>{record.label}</text>
              <text x={x} y={height - 10} textAnchor="middle" className="grade-semester-chart__students">{record.totalStudents.toLocaleString()} students</text>
            </g>
          );
        })}
        {selectedGrades.map((grade) => {
          const gradeIndex = grades.indexOf(grade);
          const points = data.map((record, index) => `${xPosition(index)},${yPosition(valueFor(record, grade))}`).join(" ");
          return (
            <g key={grade}>
              <polyline points={points} fill="none" stroke={gradeColors[gradeIndex]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {data.map((record, index) => {
                const value = valueFor(record, grade);
                return (
                  <circle key={record.semester} cx={xPosition(index)} cy={yPosition(value)} r="4" fill="#fff" stroke={gradeColors[gradeIndex]} strokeWidth="2.5">
                    <title>{`${record.label} · ${comparisonGradeLabel(grade)}: ${mode === "Percentage" ? `${value.toFixed(1)}%` : `${Math.round(value)} students`}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="grade-semester-chart__x-label">Semester</div>
      <div className="grade-semester-chart__grade-key" aria-label="Displayed grade categories">
        {selectedGrades.map((grade) => <span key={grade}><i style={{ background: gradeColors[grades.indexOf(grade)] }} />{comparisonGradeLabel(grade)}</span>)}
      </div>
    </div>
  );
}

function GradeTooltip({ record, grade, seriesLabel, instructor, selectionTotal }: { record: GradeRecord; grade: Exclude<Grade, "P">; seriesLabel?: string; instructor?: string; selectionTotal?: number }) {
  const count = record.grades[grade];
  return (
    <span className="grade-tooltip">
      <span className="grade-tooltip__heading"><i style={{ background: gradeColors[grades.indexOf(grade)] }} />Grade {gradeLabels[grade]}</span>
      <span className="grade-tooltip__row"><span>Course Record:</span><b>{seriesLabel ?? record.campus}</b></span>
      {instructor && <span className="grade-tooltip__row"><span>Instructor:</span><b>{instructor}</b></span>}
      <span className="grade-tooltip__row"><span>No. of Students:</span><b className="positive">{count.toLocaleString()} students</b></span>
      <span className="grade-tooltip__row"><span>Section Grade Percentage:</span><b className="accent">{percent(count, record).toFixed(2)}%</b></span>
      {selectionTotal !== undefined && <span className="grade-tooltip__row"><span>Filtered Selection Percentage:</span><b className="accent">{(selectionTotal ? count / selectionTotal * 100 : 0).toFixed(2)}%</b></span>}
      <span className="grade-tooltip__divider" />
      <span className="grade-tooltip__row"><span>Record Total:</span><b>{record.totalStudents.toLocaleString()} enrolled</b></span>
      <span className="grade-tooltip__row"><span>Record Passing Rate:</span><b className="positive">{passingRate(record).toFixed(1)}%</b></span>
      <span className="grade-tooltip__row"><span>Record Withdrawal Rate:</span><b className="warning">{percent(record.grades.W, record).toFixed(1)}%</b></span>
    </span>
  );
}

function CohortChart({ initialRecord, initialMode }: { initialRecord: GradeRecord; initialMode: DisplayMode }) {
  const [mode, setMode] = useState<DisplayMode>(initialMode);
  const record = initialRecord;
  const maximum = Math.max(1, ...grades.map((grade) => mode === "Percentage" ? percent(record.grades[grade], record) : record.grades[grade]));
  return (
    <div className="grade-cohort-chart">
      <div className="grade-cohort-chart__heading"><div><strong>{record.course} — {record.title}</strong><span>{record.campus} · {record.totalStudents.toLocaleString()} students · {passingRate(record).toFixed(1)}% passing</span></div><MetricToggle mode={mode} onChange={setMode} /></div>
      <div className="grade-cohort-chart__plot">
        {grades.map((grade, index) => {
          const value = mode === "Percentage" ? percent(record.grades[grade], record) : record.grades[grade];
          return <div className="grade-cohort-chart__group" key={grade}><div className="grade-cohort-chart__bar-wrap"><div className="grade-cohort-chart__bar" tabIndex={0} style={{ height: `${value / maximum * 100}%`, background: campusColor(record) }}><span>{mode === "Percentage" ? `${value.toFixed(1)}%` : value}</span><GradeTooltip record={record} grade={grade as Exclude<Grade, "P">} /></div></div><strong style={{ color: gradeColors[index] }}>{gradeLabels[grade as Exclude<Grade, "P">]}</strong></div>;
        })}
      </div>
    </div>
  );
}

export default function GradeAnalysis({ mergeEnabled, onMergeChange }: { mergeEnabled: boolean; onMergeChange: (merged: boolean) => void }) {
  const [gradeRecords, setGradeRecords] = useState<SectionGradeRecord[]>(() => combineSectionGradeRows(sectionGradeData.map(uniformGradeRecord)));
  const [activePanel, setActivePanel] = useState<"analysis" | "report">("analysis");
  const [reportMode, setReportMode] = useState<ReportMode>("course");
  const [filters, setFilters] = useState({ semesters: ["202510"], department: "All", course: "GEIT 1411", instructor: "All", campus: "All", mode: "Student Count" as DisplayMode });
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [comparisonGrades, setComparisonGrades] = useState<Grade[]>(() => [...grades]);
  const [aType, setAType] = useState<DisplayMode>("Percentage");
  const [aThreshold, setAThreshold] = useState(20);
  const [riskType, setRiskType] = useState<DisplayMode>("Percentage");
  const [riskThreshold, setRiskThreshold] = useState(20);
  const [highGradeRange, setHighGradeRange] = useState<GradeRangeOption[]>(["A+", "A"]);
  const [lowGradeRange, setLowGradeRange] = useState<GradeRangeOption[]>(["C+", "C", "D+", "D", "F", "W"]);
  const [minimumStudents, setMinimumStudents] = useState(10);
  const [topCourseCount, setTopCourseCount] = useState(5);
  const [atRiskCourseCount, setAtRiskCourseCount] = useState(5);
  const [topSectionCount, setTopSectionCount] = useState(5);
  const [atRiskSectionCount, setAtRiskSectionCount] = useState(5);
  const [variationThreshold, setVariationThreshold] = useState(15);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"campus" | "total" | "department" | "course" | "title">("course");
  const [sortAsc, setSortAsc] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);


  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [selectedEmailCourses, setSelectedEmailCourses] = useState<string[]>([]);
  const [reviewEmailDrafts, setReviewEmailDrafts] = useState(false);
  const [chairEmails, setChairEmails] = useState("mkhan@pmu.edu.sa, sabdulrahman@pmu.edu.sa, nmohammad@pmu.edu.sa");
  const [senderEmail, setSenderEmail] = useState("mkhan@pmu.edu.sa");
  const [sendingEmails, setSendingEmails] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importSemester, setImportSemester] = useState("");
  const [importFiles, setImportFiles] = useState<Partial<Record<"male" | "female" | "courses" | "combined_sections", File>>>({});
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };

  const applyRecords = (records: SectionGradeRecord[]) => {
    setGradeRecords(combineSectionGradeRows(records.map(uniformGradeRecord)));
    setSelectedSections([]);
    setExpandedCohort(null);
    setReportGenerated(false);
    setFilters((current) => ({
      ...current,
      semesters: current.semesters.filter((semester) => records.some((record) => record.semester === semester)).length ? current.semesters.filter((semester) => records.some((record) => record.semester === semester)) : [records[0]?.semester ?? "202510"],
      department: "All",
      course: "All",
      instructor: "All",
      campus: "All",
    }));
  };

  useEffect(() => {
    let cancelled = false;
    requestGradeSections(mergeEnabled)
      .then((records) => {
        if (cancelled) return;
        applyRecords(records);
      })
      .catch(() => {
        // Keep the bundled example dataset until files are imported.
      });
    return () => { cancelled = true; };
  }, [mergeEnabled]);

  const handleMergeCrossListed = async () => {
    if (isMerging || isImporting) return;
    setIsMerging(true);
    const next = !mergeEnabled;
    try {
      const records = await requestGradeSections(next);
      applyRecords(records);
      onMergeChange(next);
      showToast("success", next ? "Merged cross-listed view enabled." : "Original course view restored.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Unable to load grade data.");
    } finally {
      setIsMerging(false);
    }
  };

  const handleGradeImport = async () => {
    if (isImporting) return;
    const selected = Object.entries(importFiles).filter((entry): entry is [string, File] => Boolean(entry[1]));
    if (!selected.length) {
      showToast("error", "Select at least one CSV file to import.");
      return;
    }
    if (selected.some(([, file]) => !file.name.toLowerCase().endsWith(".csv"))) {
      showToast("error", "Only CSV files are supported.");
      return;
    }
    if (importSemester.trim() && !/^20\d{4}$/.test(importSemester.trim())) {
      showToast("error", "Semester must be a six-digit code beginning with 20.");
      return;
    }
    setIsImporting(true);
    try {
      const form = new FormData();
      selected.forEach(([field, file]) => form.append(field, file));
      if (importSemester.trim()) form.append("semester", importSemester.trim());
      let response = await fetch(`${API_BASE}/api/grades/import`, { method: "POST", body: form });
      if (response.status === 409) {
        const conflict = await response.json().catch(() => ({}));
        if (!window.confirm(`${conflict.detail ?? "These datasets already exist."} Replace only the conflicting datasets?`)) return;
        form.append("replace_existing", "true");
        response = await fetch(`${API_BASE}/api/grades/import`, { method: "POST", body: form });
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(typeof error.detail === "string" ? error.detail : "Grade import failed.");
      }
      const result: { semester: string; imported?: string[] } = await response.json();
      // Section-level records refresh independently. A courses-only import
      // remains saved on the server and available through record_type=course.
      try {
        const records = await requestGradeSections(mergeEnabled);
        applyRecords(records);
      } catch (refreshError) {
        console.warn("Grade import succeeded but the section dashboard could not refresh:", refreshError);
      }
      setFilters((current) => ({ ...current, semesters: [result.semester] }));
      setImportFiles({});
      setShowImportPanel(false);
      showToast("success", `Imported ${(result.imported ?? selected.map(([key]) => key)).join(", ")} for semester ${result.semester}.`);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Unable to import grade files.");
    } finally {
      setIsImporting(false);
    }
  };

  const semesterOptions = useMemo(() => [...new Set(gradeRecords.map((record) => record.semester))].sort(), [gradeRecords]);
  const courseOptions = useMemo(() => [...new Set(gradeRecords.filter((record) => filters.semesters.includes(record.semester)).map((record) => record.course))]
    .map((course) => {
      const records = gradeRecords.filter((record) => record.course === course);
      return {
        value: course,
        course,
        title: [...new Set(records.map((record) => record.title))].join(" / "),
        department: records[0].department,
      };
    })
    .sort((a, b) => a.course.localeCompare(b.course)), [filters.semesters, gradeRecords]);
  const departmentOptions = useMemo(() => [...new Set(gradeRecords.filter((record) => filters.semesters.includes(record.semester)).map((record) => record.department))].sort(), [filters.semesters, gradeRecords]);

  const instructorOptions = useMemo(() => [...new Set(gradeRecords.filter((item) =>
    filters.semesters.includes(item.semester) &&
    (filters.department === "All" || item.department === filters.department) &&
    (filters.course === "All" || item.course === filters.course)
  ).map((item) => item.instructor))].sort(), [filters.course, filters.department, filters.semesters, gradeRecords]);

  const availableSections = useMemo(() => gradeRecords.filter((item) =>
    filters.semesters.includes(item.semester) &&
    (filters.department === "All" || item.department === filters.department) &&
    (filters.course === "All" || item.course === filters.course) &&
    (filters.instructor === "All" || item.instructor === filters.instructor) &&
    (filters.campus === "All" || item.campus.startsWith(filters.campus))
  ), [filters.campus, filters.course, filters.department, filters.instructor, filters.semesters, gradeRecords]);

  const sections = useMemo(() => {
    const result = availableSections.filter((item) =>
      !selectedSections.length || selectedSections.includes(sectionKey(item))
    );
    return [...result].sort((a, b) => {
      const first = sortKey === "total" ? total(a) : a[sortKey];
      const second = sortKey === "total" ? total(b) : b[sortKey];
      return (typeof first === "number" ? first - (second as number) : String(first).localeCompare(String(second))) * (sortAsc ? 1 : -1);
    });
  }, [availableSections, selectedSections, sortAsc, sortKey]);

  const studentTotal = sections.reduce((sum, section) => sum + total(section), 0);
  const selectedCourseCount = new Set(sections.map((section) => section.course)).size;
  const overallA = studentTotal ? sections.reduce((sum, section) => sum + highGrades(section), 0) / studentTotal * 100 : 0;
  const overallPassing = studentTotal ? sections.reduce((sum, section) => sum + passingGrades(section), 0) / studentTotal * 100 : 0;
  const gradeBasedRisk = studentTotal ? sections.reduce((sum, section) => sum + section.grades["D+"] + section.grades["D&Below"], 0) / studentTotal * 100 : 0;
  const withdrawalRate = studentTotal ? sections.reduce((sum, section) => sum + section.grades.W, 0) / studentTotal * 100 : 0;
  const atRiskCourseGroups = sections.filter((section) => {
    const lowGradeCount = section.grades["D+"] + section.grades["D&Below"];
    const value = riskType === "Percentage" ? percent(lowGradeCount, section) : lowGradeCount;
    return section.totalStudents >= minimumStudents && value >= riskThreshold;
  }).length;
  const chartSeries = useMemo<ChartSeries[]>(() => {
    const counters = { "Male Campus": 0, "Female Campus": 0 };
    return [...sections]
      .sort((a, b) => Number(a.campus.startsWith("Female")) - Number(b.campus.startsWith("Female")) || a.section.localeCompare(b.section, undefined, { numeric: true }))
      .map((record) => ({
        ...record,
        grades: { ...record.grades },
        label: sectionLabel(record),
        section: record.section,
        instructor: record.instructor,
        colorIndex: counters[record.campus]++,
      }));
  }, [sections]);
  const chartCampusGroups = useMemo(() => (["Male Campus", "Female Campus"] as const)
    .map((campus) => ({ campus, series: chartSeries.filter((item) => item.campus === campus) }))
    .filter((group) => group.series.length), [chartSeries]);
  const maxCount = Math.max(1, ...grades.map((grade) => chartSeries.reduce((sum, section) => sum + section.grades[grade], 0)));
  const maxPercentage = Math.max(10, Math.min(100, Math.ceil(Math.max(...grades.map((grade) => studentTotal ? chartSeries.reduce((sum, section) => sum + section.grades[grade], 0) / studentTotal * 100 : 0), 0) / 10) * 10));
  const comparisonEnabled = filters.semesters.length >= 2 && filters.course !== "All";
  const semesterComparison = useMemo<SemesterComparisonRecord[]>(() => {
    if (!comparisonEnabled) return [];
    return semesterOptions.filter((semester) => filters.semesters.includes(semester)).map((semester) => {
      const records = gradeRecords.filter((record) =>
        record.semester === semester &&
        record.course === filters.course &&
        (filters.department === "All" || record.department === filters.department) &&
        (filters.instructor === "All" || record.instructor === filters.instructor) &&
        (filters.campus === "All" || record.campus.startsWith(filters.campus))
      );
      return {
        semester,
        label: semesterLabel(semester),
        color: semesterColors[semesterOptions.indexOf(semester) % semesterColors.length],
        totalStudents: records.reduce((sum, record) => sum + record.totalStudents, 0),
        grades: Object.fromEntries(allGrades.map((grade) => [
          grade,
          records.reduce((sum, record) => sum + record.grades[grade], 0),
        ])) as Record<Grade, number>,
      };
    });
  }, [comparisonEnabled, filters.campus, filters.course, filters.department, filters.instructor, filters.semesters, gradeRecords, semesterOptions]);
  const selectedSemesterLabels = filters.semesters.map(semesterLabel).join(", ");

  const rankedCourses = useMemo(() => {
    const grouped = new Map<string, ChartSeries>();
    sections.forEach((record) => {
      const current = grouped.get(record.course);
      if (current) {
        current.totalStudents += record.totalStudents;
        allGrades.forEach((grade) => { current.grades[grade] += record.grades[grade]; });
      } else {
        grouped.set(record.course, { ...record, grades: { ...record.grades }, label: record.course });
      }
    });
    return [...grouped.values()];
  }, [sections]);
  const reportRecords = reportMode === "course" ? rankedCourses : sections;
  const reportPotentiallyEasy = useMemo(() => reportRecords
    .filter((record) => {
      const count = gradeRangeCount(record, highGradeRange);
      const value = aType === "Percentage" ? percent(count, record) : count;
      return record.totalStudents >= minimumStudents && value >= aThreshold;
    })
    .sort((a, b) => percent(gradeRangeCount(b, highGradeRange), b) - percent(gradeRangeCount(a, highGradeRange), a)), [aThreshold, aType, highGradeRange, minimumStudents, reportRecords]);
  const reportPotentiallyDifficult = useMemo(() => reportRecords
    .filter((record) => {
      const lowGradeCount = gradeRangeCount(record, lowGradeRange);
      const value = riskType === "Percentage" ? percent(lowGradeCount, record) : lowGradeCount;
      return record.totalStudents >= minimumStudents && value >= riskThreshold;
    })
    .sort((a, b) => percent(gradeRangeCount(b, lowGradeRange), b) - percent(gradeRangeCount(a, lowGradeRange), a)), [lowGradeRange, minimumStudents, reportRecords, riskThreshold, riskType]);
  const allNotableSectionDifferences = useMemo(() => {
    const grouped = new Map<string, SectionGradeRecord[]>();
    sections.forEach((record) => grouped.set(record.course, [...(grouped.get(record.course) ?? []), record]));
    return [...grouped.entries()].flatMap(([course, records]) => {
      if (records.length < 2) return [];
      const measures = [
        { label: "Combined A+/A", count: (record: SectionGradeRecord) => highGrades(record) },
        { label: "Combined D+ & Below", count: (record: SectionGradeRecord) => record.grades["D+"] + record.grades["D&Below"] },
      ];
      return measures.map((measure) => {
        const ranked = records.map((record) => ({ record, rate: percent(measure.count(record), record) })).sort((a, b) => b.rate - a.rate);
        return { course, title: records[0].title, measure: measure.label, highest: ranked[0], lowest: ranked[ranked.length - 1], difference: ranked[0].rate - ranked[ranked.length - 1].rate };
      }).filter((item) => item.difference >= variationThreshold);
    }).sort((a, b) => b.difference - a.difference);
  }, [sections, variationThreshold]);
  const notableSectionDifferences = allNotableSectionDifferences;
  const topPerformingSections = useMemo(() => sections.filter((record) => {
    const count = gradeRangeCount(record, highGradeRange);
    const value = aType === "Percentage" ? percent(count, record) : count;
    return record.totalStudents >= minimumStudents && value >= aThreshold;
  })
    .sort((a, b) => percent(gradeRangeCount(b, highGradeRange), b) - percent(gradeRangeCount(a, highGradeRange), a))
    .slice(0, topSectionCount), [aThreshold, aType, highGradeRange, minimumStudents, sections, topSectionCount]);
  const atRiskSections = useMemo(() => sections.filter((record) => {
    const lowGradeCount = gradeRangeCount(record, lowGradeRange);
    const value = riskType === "Percentage" ? percent(lowGradeCount, record) : lowGradeCount;
    return record.totalStudents >= minimumStudents && value >= riskThreshold;
  }).sort((a, b) => percent(gradeRangeCount(b, lowGradeRange), b) - percent(gradeRangeCount(a, lowGradeRange), a))
    .slice(0, atRiskSectionCount), [atRiskSectionCount, lowGradeRange, minimumStudents, riskThreshold, riskType, sections]);
  const emailReportCourses = useMemo(() => {
    const records = reportMode === "course"
      ? [...reportPotentiallyEasy.slice(0, topCourseCount), ...reportPotentiallyDifficult.slice(0, atRiskCourseCount)]
      : [...topPerformingSections, ...atRiskSections];
    return [...new Set(records.map((record) => record.course))].sort();
  }, [atRiskCourseCount, atRiskSections, reportMode, reportPotentiallyDifficult, reportPotentiallyEasy, topCourseCount, topPerformingSections]);
  const buildCourseEmail = (course: string) => {
    const courseSections = sections.filter((record) => record.course === course);
    const instructors = [...new Set(courseSections.map((record) => record.instructor))];
    const missingRecipients = instructors.filter((instructor) => !findProfessorEmail(instructor));
    const recipients = [...new Set(instructors.flatMap((instructor) => {
      const email = findProfessorEmail(instructor);
      return email ? [email] : [];
    }))];
    const highFlag = reportPotentiallyEasy.some((record) => record.course === course) || topPerformingSections.some((record) => record.course === course);
    const lowFlag = reportPotentiallyDifficult.some((record) => record.course === course) || atRiskSections.some((record) => record.course === course);
    const details = courseSections.map((record) => {
      const breakdown = allGrades.map((grade) => `${grade}: ${record.grades[grade]}`).join(", ");
      return `Section ${record.section} — ${record.instructor} — ${record.totalStudents} students\n${breakdown}`;
    }).join("\n\n");
    return {
      course,
      to: recipients,
      missingRecipients,
      subject: `${course} Grade Distribution Review`,
      body: `Sender: ${senderEmail}\n\nReport flag: ${[highFlag ? "High average performance" : "", lowFlag ? "Low average performance" : ""].filter(Boolean).join(" and ")}\n\nCourse: ${course} — ${courseSections[0]?.title ?? ""}\nInstructors: ${instructors.join(", ")}\n\nGrade breakdown by section and instructor:\n${details}`,
    };
  };
  const sendReportEmails = async () => {
    setSendingEmails(true);
    try {
      const cc = chairEmails.split(/[;,]/).map((email) => email.trim()).filter(Boolean);
      const drafts = selectedEmailCourses.map(buildCourseEmail);
      const unresolved = drafts.flatMap((draft) => draft.missingRecipients);
      if (unresolved.length) {
        throw new Error(`No directory email found for: ${[...new Set(unresolved)].join(", ")}.`);
      }
      const messages = drafts.map(({ course, to, subject, body }) => ({ course, to, subject, body, cc }));
      const response = await fetch("/api/send-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
      const result = await response.json() as { error?: string; sent?: number };
      if (!response.ok) throw new Error(result.error ?? "Unable to send report emails.");
      showToast("success", `${result.sent ?? messages.length} report emails sent successfully.`);
      setShowEmailPanel(false);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Unable to send report emails.");
    } finally {
      setSendingEmails(false);
    }
  };
  
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const courseReportLines = [
    "PMU - CCES",
    "Course Difficulty & Ease Analysis Report",
    `Scope: ${selectedCourseCount} courses, ${studentTotal} students`,
    `Filters: Semesters ${selectedSemesterLabels}; Department ${filters.department}; Course ${filters.course}; Instructor ${filters.instructor}; Campus ${filters.campus}; Sections ${selectedSections.length ? selectedSections.length : "All"}`,
    `Potentially easy threshold: A/A+ >= ${aThreshold}${aType === "Percentage" ? "%" : " students"}`,
    `Potentially difficult threshold: D+ & Below >= ${riskThreshold}${riskType === "Percentage" ? "%" : " students"}`,
    `Minimum students per course group: ${minimumStudents}`,
    "",
    `Courses with High Average Performance (${Math.min(reportPotentiallyEasy.length, topCourseCount)})`,
    ...reportPotentiallyEasy.slice(0, topCourseCount).map((record) => `${record.course} - ${record.title} | ${gradeRangeCount(record, highGradeRange)} of ${record.totalStudents} students (${percent(gradeRangeCount(record, highGradeRange), record).toFixed(1)}%) in ${highGradeRange.join(", ")}`),
    "",
    `Courses with Low Average Performance (${Math.min(reportPotentiallyDifficult.length, atRiskCourseCount)})`,
    ...reportPotentiallyDifficult.slice(0, atRiskCourseCount).map((record) => {
      const lowGradeCount = gradeRangeCount(record, lowGradeRange);
      return `${record.course} - ${record.title} | ${lowGradeCount} of ${record.totalStudents} (${percent(lowGradeCount, record).toFixed(1)}%) in ${lowGradeRange.join(", ")} | Passing: ${passingGrades(record)} of ${record.totalStudents} (${passingRate(record).toFixed(1)}%) | Withdrawal: ${record.grades.W} of ${record.totalStudents} (${percent(record.grades.W, record).toFixed(1)}%)`;
    }),
    "",
    "These configurable rules are illustrative and are not official PMU academic standards.",
  ];
  const sectionReportLines = [
    "PMU - CCES",
    "Section-Level Grade Analysis Report",
    `Scope: ${sections.length} sections, ${studentTotal} students`,
    `Filters: Semesters ${selectedSemesterLabels}; Department ${filters.department}; Course ${filters.course}; Instructor ${filters.instructor}; Campus ${filters.campus}; Sections ${selectedSections.length ? selectedSections.length : "All"}`,
    "",
    `Sections with High Average Performance (${topPerformingSections.length})`,
    ...topPerformingSections.map((record, index) => `${index + 1}. ${record.course} - ${record.title} | Section ${record.section} | ${record.instructor} | ${record.totalStudents} students | Selected range ${percent(gradeRangeCount(record, highGradeRange), record).toFixed(1)}%`),
    "",
    `Sections with Low Average Performance (${atRiskSections.length})`,
    ...atRiskSections.map((record, index) => `${index + 1}. ${record.course} - ${record.title} | Section ${record.section} | ${record.instructor} | ${record.totalStudents} students | Selected range ${percent(gradeRangeCount(record, lowGradeRange), record).toFixed(1)}%`),
    "",
    "Variation measures: Combined A+/A and Combined D+ & Below",
    `Section Grade Variation Analysis >= ${variationThreshold} percentage points (${notableSectionDifferences.length})`,
    ...notableSectionDifferences.map((item) => `${item.course} - ${item.title} | ${item.measure}: ${item.difference.toFixed(1)} pp | Section ${item.highest.record.section} (${item.highest.record.campus}, ${item.highest.record.totalStudents} students) ${item.highest.rate.toFixed(1)}% vs Section ${item.lowest.record.section} (${item.lowest.record.campus}, ${item.lowest.record.totalStudents} students) ${item.lowest.rate.toFixed(1)}%`),
  ];
  const reportLines = reportMode === "course" ? courseReportLines : sectionReportLines;

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Setting: "College", Value: "CCES" },
      { Setting: "Report View", Value: reportMode === "course" ? "By Course" : "By Section" },
      { Setting: "Semesters", Value: selectedSemesterLabels },
      { Setting: "Department", Value: filters.department },
      { Setting: "Course", Value: filters.course },
      { Setting: "Instructor", Value: filters.instructor },
      { Setting: "Campus", Value: filters.campus },
      { Setting: "Sections", Value: selectedSections.length ? selectedSections.length : "All Sections" },
      { Setting: "High Average Performance Threshold", Value: aThreshold, Type: aType },
      { Setting: "Low Average Performance Threshold", Value: riskThreshold, Type: riskType },
      { Setting: "Minimum Students", Value: minimumStudents },
      { Setting: "High-performance Courses to Display", Value: topCourseCount },
      { Setting: "Low-performance Courses to Display", Value: atRiskCourseCount },
      { Setting: "High-performance Sections to Display", Value: topSectionCount },
      { Setting: "Low-performance Sections to Display", Value: atRiskSectionCount },
      { Setting: "Section Variation Threshold", Value: variationThreshold, Type: "Percentage Points" },
    ]), "Criteria");
    if (reportMode === "section") {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(topPerformingSections.map((record, index) => ({
        Rank: index + 1,
        Course: record.course,
        "Course Name": record.title,
        Section: record.section,
        Instructor: record.instructor,
        Students: record.totalStudents,
        "A/A+ Count": highGrades(record),
        "A/A+ Percentage": percent(highGrades(record), record) / 100,
      }))), "Top Sections");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(atRiskSections.map((record, index) => ({
        Rank: index + 1,
        Course: record.course,
        "Course Name": record.title,
        Section: record.section,
        Instructor: record.instructor,
        Students: record.totalStudents,
        "D+ & Below Count": record.grades["D+"] + record.grades["D&Below"],
        "D+ & Below Rate": percent(record.grades["D+"] + record.grades["D&Below"], record) / 100,
      }))), "At Risk Sections");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notableSectionDifferences.map((item) => ({
        Course: item.course,
        "Course Name": item.title,
        "Grade Measure": item.measure,
        "Difference (percentage points)": item.difference,
        "Highest Section": item.highest.record.section,
        "Highest Campus": item.highest.record.campus,
        "Highest Section Students": item.highest.record.totalStudents,
        "Highest Percentage": item.highest.rate / 100,
        "Lowest Section": item.lowest.record.section,
        "Lowest Campus": item.lowest.record.campus,
        "Lowest Section Students": item.lowest.record.totalStudents,
        "Lowest Percentage": item.lowest.rate / 100,
      }))), "Notable Differences");
      XLSX.writeFileXLSX(workbook, "PMU_CCES_Section_Grade_Analysis_Report.xlsx");
      return;
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportPotentiallyEasy.map((record) => ({
      Department: record.department,
      Course: record.course,
      Title: record.title,
      Students: record.totalStudents,
      "A/A+ Count": highGrades(record),
      "A/A+ Rate": percent(highGrades(record), record) / 100,
      ...record.grades,
    }))), "High Performance");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportPotentiallyDifficult.map((record) => {
      const lowGradeCount = record.grades["D+"] + record.grades["D&Below"];
      return {
        Department: record.department,
        Course: record.course,
        Title: record.title,
        Students: record.totalStudents,
        "D+ & Below Count": lowGradeCount,
        "D+ & Below Rate": percent(lowGradeCount, record) / 100,
        "Passing Rate": passingRate(record) / 100,
        "Withdrawal Rate": percent(record.grades.W, record) / 100,
      };
    })), "Low Performance");
    XLSX.writeFileXLSX(workbook, "PMU_CCES_Course_Difficulty_Ease_Report.xlsx");
  };

  const toggleSemester = (semester: string) => {
    const selected = filters.semesters.includes(semester);
    if (selected && filters.semesters.length === 1) return;
    const semesters = selected
      ? filters.semesters.filter((value) => value !== semester)
      : [...filters.semesters, semester].sort();
    const courseAvailable = filters.course === "All" || gradeRecords.some((record) => semesters.includes(record.semester) && record.course === filters.course);
    setSelectedSections([]);
    setReportGenerated(false);
    setFilters((current) => ({
      ...current,
      semesters,
      course: courseAvailable ? current.course : "All",
      instructor: "All",
      mode: semesters.length >= 2 && current.semesters.length < 2 ? "Percentage" : current.mode,
    }));
  };

  const renderFilterControls = () => (
    <section className="grade-filters grade-panel">
      <div className="grade-filter-field grade-semester-filter">
        <label>Semester</label>
        <details>
          <summary>{filters.semesters.length === 1 ? semesterLabel(filters.semesters[0]) : `${filters.semesters.length} semesters selected`}</summary>
          <div className="grade-semester-filter__menu">
            <strong>Select semesters</strong>
            {semesterOptions.map((semester) => <label key={semester}><input type="checkbox" checked={filters.semesters.includes(semester)} onChange={() => toggleSemester(semester)} /><span>{semesterLabel(semester)}</span></label>)}
          </div>
        </details>
      </div>
      <div className="grade-filter-field"><label>College</label><select value="CCES" disabled><option>CCES</option></select></div>
      <div className="grade-filter-field"><label>Department</label><select value={filters.department} onChange={(e) => { setSelectedSections([]); setReportGenerated(false); setFilters((current) => ({ ...current, department: e.target.value, course: "All", instructor: "All" })); }}><option value="All">All Departments</option>{departmentOptions.map((department) => <option key={department}>{department}</option>)}</select></div>
      <div className="grade-filter-field"><label>Course</label><select value={filters.course} onChange={(e) => { setSelectedSections([]); setReportGenerated(false); setFilters((current) => ({ ...current, course: e.target.value, instructor: "All" })); }}><option value="All">All Courses</option>{courseOptions.filter((option) => filters.department === "All" || option.department === filters.department || option.value === filters.course).map((option) => <option key={option.value} value={option.value}>{option.course} — {option.title}</option>)}</select></div>
      <div className="grade-filter-field"><label>Instructor</label><select value={filters.instructor} onChange={(e) => { setReportGenerated(false); setFilters((current) => ({ ...current, instructor: e.target.value })); }}><option value="All">All Instructors</option>{filters.instructor !== "All" && !instructorOptions.includes(filters.instructor) && <option>{filters.instructor}</option>}{instructorOptions.map((instructor) => <option key={instructor}>{instructor}</option>)}</select></div>
      <div className="grade-filter-field grade-section-filter">
        <label>Section</label>
        <details>
          <summary>{comparisonEnabled ? "All sections aggregated" : selectedSections.length ? `${selectedSections.length} Sections Selected` : "All Sections"}</summary>
          <div className="grade-section-filter__menu">
            {comparisonEnabled ? <span>Cross-semester comparison includes all matching sections.</span> : filters.course === "All" ? <span>Select a course to view sections.</span> : <>
              <button className={!selectedSections.length ? "active" : ""} onClick={() => { setSelectedSections([]); setReportGenerated(false); }}><i>{!selectedSections.length ? "✓" : ""}</i><span>All Sections</span><b>{availableSections.length}</b></button>
              {availableSections.map((record) => {
                const key = sectionKey(record);
                const active = selectedSections.includes(key);
                return <button className={active ? "active" : ""} key={key} onClick={() => { setReportGenerated(false); setSelectedSections((current) => active ? (current.length === 1 ? [] : current.filter((item) => item !== key)) : [...current, key]); }}><i>{active ? "✓" : ""}</i><span>{sectionLabel(record)}</span><b>{record.totalStudents}</b></button>;
              })}
            </>}
          </div>
        </details>
      </div>
      <div className="grade-filter-actions"><button className="grade-reset" onClick={() => { setSelectedSections([]); setReportGenerated(false); setFilters({ semesters: [gradeRecords[0]?.semester ?? "202510"], department: "All", course: gradeRecords.some((record) => record.course === "GEIT 1411") ? "GEIT 1411" : "All", instructor: "All", campus: "All", mode: "Student Count" }); }}>Reset</button></div>
    </section>
  );

  return (
    <div className="grade-page">
      <section className="grade-hero">
        <div>
          <span className="grade-eyebrow"><MiniIcon name="chart" /> Academic performance intelligence</span>
          <h1>Grade Distribution Analysis</h1>
          <p>Analyze grades and compare course records across campuses.</p>
        </div>
        <div className="grade-hero-buttons">
          <button className="grade-button grade-button--secondary grade-merge-action" disabled={isMerging || isImporting} onClick={() => void handleMergeCrossListed()}>
            {isMerging ? <span className="grade-button-spinner" aria-hidden="true" /> : <MiniIcon name="sections" />}
            {isMerging ? "Loading…" : mergeEnabled ? "Show Original Courses" : "Merge Cross-Listed Courses"}
          </button>
          <button className="grade-button grade-button--primary" disabled={isImporting || isMerging} onClick={() => setShowImportPanel((current) => !current)}>
            <MiniIcon name="upload" /> {showImportPanel ? "Close Import" : "Import Files"}
          </button>
        </div>
      </section>
      {showImportPanel && (
        <section className="grade-import-panel" style={{ padding: 16, marginBottom: 20, border: "1px solid #d5dbe5", borderRadius: 12 }}>
          <label style={{ display: "block", marginBottom: 10 }}>
            Select CSV files (up to four)
            <input
              style={{ display: "block", marginTop: 6 }}
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={isImporting}
              onChange={(event) => {
                const incoming = Array.from(event.target.files ?? []);
                const classify = (name: string): keyof typeof importFiles | null => {
                  const n = name.toLowerCase();
                  if (/course|merged_male_female/.test(n) && !/section/.test(n)) return "courses";
                  if (/combined.*section|section.*combined/.test(n)) return "combined_sections";
                  if (/female/.test(n) && !/male.*female|female.*male/.test(n)) return "female";
                  if (/male/.test(n) && !/female/.test(n)) return "male";
                  return null;
                };
                const next: typeof importFiles = {};
                const unknown: string[] = [];
                const duplicates: string[] = [];
                for (const file of incoming) {
                  const key = classify(file.name);
                  if (!key) { unknown.push(file.name); continue; }
                  if (next[key]) { duplicates.push(file.name); continue; }
                  next[key] = file;
                }
                setImportFiles(next);
                if (unknown.length || duplicates.length) {
                  showToast("error", `Could not assign: ${[...unknown, ...duplicates].join(", ")}. Rename files to identify courses, male, female, or combined sections.`);
                }
                event.target.value = "";
              }}
            />
          </label>
          {Object.entries(importFiles).filter(([, file]) => Boolean(file)).map(([kind, file]) => (
            <div key={kind} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <span>{kind.replaceAll("_", " ")}: {file?.name}</span>
              <button type="button" className="grade-button grade-button--secondary" disabled={isImporting} onClick={() => setImportFiles((current) => {
                const next = { ...current };
                delete next[kind as keyof typeof next];
                return next;
              })}>Remove</button>
            </div>
          ))}
          <label style={{ display: "block", marginTop: 10, marginBottom: 12 }}>
            Semester code (only if not included in filenames)
            <input style={{ display: "block", marginTop: 5, padding: 8 }} type="text" inputMode="numeric" placeholder="e.g. 202510" value={importSemester} onChange={(event) => setImportSemester(event.target.value)} />
          </label>
          <button className="grade-button grade-button--primary" disabled={isImporting || isMerging || !Object.values(importFiles).some(Boolean)} onClick={() => void handleGradeImport()}>
            {isImporting ? "Importing…" : "Import Selected Files"}
          </button>
        </section>
      )}
      {toast && <div className={`grade-toast grade-toast--${toast.type}`} role="status" aria-live="polite"><MiniIcon name={toast.type === "error" ? "alert" : toast.type === "success" ? "check" : "sections"} /><span>{toast.message}</span></div>}

      <div className="grade-view-tabs" role="tablist" aria-label="Grade analysis views">
        <button className={activePanel === "analysis" ? "active" : ""} onClick={() => setActivePanel("analysis")} role="tab" aria-selected={activePanel === "analysis"}><MiniIcon name="chart" /><span>Analysis Dashboard<small>Explore distributions and course records</small></span></button>
        <button className={activePanel === "report" ? "active" : ""} onClick={() => setActivePanel("report")} role="tab" aria-selected={activePanel === "report"}><MiniIcon name="sections" /><span>Report<small>Key findings and detailed summary</small></span></button>
      </div>

      {activePanel === "analysis" ? <>
      {renderFilterControls()}
      <section className="grade-summary">
        <GradeStat icon="users" label="Students in Selection" value={studentTotal.toLocaleString()} note={`Across ${selectedCourseCount} filtered ${selectedCourseCount === 1 ? "course" : "courses"}`} />
        <GradeStat icon="sections" label="Sections in Selection" value={String(sections.length)} note={selectedSections.length ? `${selectedSections.length} selected sections` : "All sections included"} />
        <GradeStat icon="award" label="A/A+ Rate" value={`${overallA.toFixed(1)}%`} note="Percentage of selected students receiving A or A+." />
        <GradeStat icon="award" label="Overall Passing Rate" value={`${overallPassing.toFixed(1)}%`} note="Students passing" />
        <GradeStat icon="sections" label="At-Risk Course Groups" value={String(atRiskCourseGroups)} note="Based on risk threshold" warning />
        <GradeStat icon="alert" label="Academic Risk Rate" value={`${gradeBasedRisk.toFixed(1)}%`} note="Percentage of selected students receiving D+ or D & Below." warning />
        <GradeStat icon="alert" label="Withdrawal Rate" value={`${withdrawalRate.toFixed(1)}%`} note="Percentage of selected students receiving W." warning />
      </section>

      <section className="grade-panel grade-chart-card">
        <div className="grade-card-heading">
          <div><h2>{comparisonEnabled ? `${filters.course} Grade Distribution Across Semesters` : "Grade Distribution Across Letter Grades"}</h2>{comparisonEnabled && <p>All matching sections are aggregated within each semester before percentages are calculated.</p>}</div>
          <div className="grade-chart-actions">
            {comparisonEnabled && <details className="grade-comparison-grade-filter">
              <summary>{comparisonGrades.length} grade categories</summary>
              <div>
                <strong>Display grades</strong>
                {grades.map((grade, index) => <label key={grade}><input type="checkbox" checked={comparisonGrades.includes(grade)} onChange={() => setComparisonGrades((current) => current.includes(grade) ? (current.length === 1 ? current : current.filter((value) => value !== grade)) : [...current, grade])} /><i style={{ background: gradeColors[index] }} /><span>{comparisonGradeLabel(grade)}</span></label>)}
              </div>
            </details>}
            <div className="grade-chart-toggles"><div className="grade-segment">{["All", "Male", "Female"].map((campus) => <button className={filters.campus === campus ? "active" : ""} onClick={() => { setReportGenerated(false); setFilters((current) => ({ ...current, campus })); }} key={campus}>{campus}</button>)}</div><MetricToggle mode={filters.mode} onChange={(mode) => setFilters((current) => ({ ...current, mode }))} /></div>
          </div>
        </div>
        {comparisonEnabled ? <>
          <div className="grade-semester-legend" aria-label="Selected semesters">{semesterComparison.map((record) => <span key={record.semester}><i style={{ background: record.color }} /><b>{record.label}</b></span>)}</div>
          <SemesterComparisonChart data={semesterComparison} mode={filters.mode} selectedGrades={comparisonGrades} />
        </> : <>
          <div className="grade-chart-legend grade-chart-legend--single-line">{chartSeries.map((section) => <span key={chartSeriesKey(section)}><i style={{ background: chartSeriesColor(section) }} /><b>{section.course} · Sec {section.section}</b></span>)}</div>
          <div className="grade-chart-wrap">
            <span className="grade-y-label">{filters.mode}</span>
            <div className="grade-y-axis">{[4, 3, 2, 1, 0].map((step) => <span key={step}>{filters.mode === "Percentage" ? `${Math.round(maxPercentage * step / 4)}%` : Math.ceil(maxCount * step / 4)}</span>)}</div>
            <div className="grade-chart">
              {grades.map((grade, gradeIndex) => (
                <div className="grade-group" key={grade}>
                  <div className="grade-bars grade-bars--stacked">
                    <div className="grade-stack">
                    {chartSeries.map((section) => {
                        const count = section.grades[grade];
                        const pct = studentTotal ? count / studentTotal * 100 : 0;
                        const chartValue = filters.mode === "Percentage" ? pct / maxPercentage : count / maxCount;
                        const displayValue = filters.mode === "Percentage" ? `${pct.toFixed(1)}%` : count.toLocaleString();
                        return <div className={`grade-bar grade-bar--stacked grade-bar--${section.campus.startsWith("Male") ? "male" : "female"}`} key={chartSeriesKey(section)} style={{ height: `${Math.max(count ? 1 : 0, chartValue * 100)}%`, background: chartSeriesColor(section) }} tabIndex={0}><span className="grade-stack-value">{displayValue}</span><GradeTooltip record={section} grade={grade as Exclude<Grade, "P">} seriesLabel={section.label} instructor={section.instructor} selectionTotal={studentTotal} /></div>;
                      })}
                    </div>
                  </div>
                  <span className="grade-category"><strong style={{ color: gradeColors[gradeIndex] }}>{gradeLabels[grade as Exclude<Grade, "P">]}</strong></span>
                </div>
              ))}
            </div>
          </div>
          <div className="grade-x-label">Grade category</div>
        </>}
      </section>

      <section className="grade-panel grade-table-card">
        <div className="grade-card-heading"><div><h2>Course, Campus &amp; Section Breakdown</h2></div><span className="grade-table-count">{sections.length} section records</span></div>
        <div className="grade-table-scroll"><table><thead><tr>
          <th>Semester</th>
          <th><button onClick={() => toggleSort("course")}>Course {sortKey === "course" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th><button onClick={() => toggleSort("title")}>Course Title {sortKey === "title" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th><button onClick={() => toggleSort("campus")}>Campus {sortKey === "campus" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th>Section</th><th>Instructor</th>
          <th><button onClick={() => toggleSort("total")}>Total {sortKey === "total" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          {(["A+", "A", "D+", "D&Below", "W"] as Grade[]).map((grade) => <th key={grade}>{grade === "D&Below" ? "D & F" : grade}</th>)}<th>Record Chart</th>
        </tr></thead><tbody>{sections.map((section) => { const key = cohortKey(section); const expanded = expandedCohort === key; return <Fragment key={key}><tr><td><strong>{semesterLabel(section.semester)}</strong></td><td><strong>{section.course}</strong></td><td>{section.title}</td><td><span className={`grade-campus grade-campus--${section.campus.startsWith("Male") ? "male" : "female"}`}>{section.campus}</span></td><td><strong>{section.section}</strong></td><td>{section.instructor}</td><td><strong>{total(section)}</strong></td>{(["A+", "A", "D+", "D&Below", "W"] as Grade[]).map((grade) => <td key={grade}><strong>{section.grades[grade]}</strong><span>{percent(section.grades[grade], section).toFixed(1)}%</span></td>)}<td><button className={`grade-chart-toggle ${expanded ? "active" : ""}`} onClick={() => setExpandedCohort(expanded ? null : key)}><MiniIcon name="chart" />{expanded ? "Hide chart" : "View chart"}</button></td></tr>{expanded && <tr className="grade-expanded-row"><td colSpan={13}><CohortChart initialRecord={section} initialMode={filters.mode} /></td></tr>}</Fragment>; })}</tbody></table></div>
      </section>
      </> : <>
      <section className="grade-report-hero grade-panel">
        <div>
          <span className="grade-report-kicker">PMU · CCES</span>
          <h2>{reportMode === "course" ? "Course Difficulty & Ease Analysis Report" : "Section-Level Grade Analysis Report"}</h2>
          <p>{reportMode === "course" ? "Identify courses with grade patterns that may warrant academic review." : "Compare individual sections and identify notable differences requiring review."}</p>
        </div>
        <div className="grade-report-hero__meta">
          <span className="grade-report-scope">{selectedCourseCount} courses · {sections.length} sections · {studentTotal.toLocaleString()} students</span>
          <div className="grade-export-block"><span>{reportGenerated ? "Download generated report" : "Generate the report to enable downloads"}</span><div className="grade-export-actions"><button className="grade-button grade-button--secondary" disabled={!reportGenerated} onClick={() => downloadBlob(createPdfBlob(reportLines), reportMode === "course" ? "PMU_CCES_Course_Difficulty_Ease_Report.pdf" : "PMU_CCES_Section_Grade_Analysis_Report.pdf")}><MiniIcon name="download" /> PDF</button><button className="grade-button grade-button--secondary" disabled={!reportGenerated} onClick={exportExcel}><MiniIcon name="download" /> Excel</button><button className="grade-button grade-button--secondary" disabled={!reportGenerated} onClick={() => downloadBlob(createDocxBlob(reportLines), reportMode === "course" ? "PMU_CCES_Course_Difficulty_Ease_Report.docx" : "PMU_CCES_Section_Grade_Analysis_Report.docx")}><MiniIcon name="download" /> DOCX</button></div></div>
        </div>
      </section>
      <div className="grade-report-controls">
      <section className="grade-report-view-switch grade-panel" aria-labelledby="grade-report-view-label">
        <div>
          <span id="grade-report-view-label">Report grouping</span>
          <strong>{reportMode === "course" ? "Course-level analysis" : "Section-level analysis"}</strong>
        </div>
        <div className="grade-segment" role="tablist" aria-label="Report grouping">
          {([
            { value: "course", label: "By Course" },
            { value: "section", label: "By Section" },
          ] as const).map((option) => (
            <button
              type="button"
              role="tab"
              aria-selected={reportMode === option.value}
              className={reportMode === option.value ? "active" : ""}
              onClick={() => {
                setReportMode(option.value);
                setReportGenerated(false);
              }}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      <div className="grade-report-filter-row">{renderFilterControls()}</div>
      <section className="grade-panel grade-report grade-analysis-criteria">
        <div className="grade-report-section-heading"><span>01</span><div><h2>Analysis Criteria</h2><p>Choose when {reportMode === "course" ? "a course group" : "an individual section"} should be classified.</p></div></div>
        <div className="grade-classification-settings">
          <article className="grade-classification-rule grade-classification-rule--easy">
            <h3>{reportMode === "course" ? "Courses with High Average Performance" : "Sections with High Average Performance"}</h3>
            <div className="grade-classification-rule__controls">
              <label>Threshold Type<div className="grade-segment">{(["Percentage", "Student Count"] as DisplayMode[]).map((type) => <button className={aType === type ? "active" : ""} onClick={() => { setAType(type); setReportGenerated(false); }} key={type}>{type}</button>)}</div></label>
              <label>Threshold Value<div><input type="number" min="0" max={aType === "Percentage" ? 100 : undefined} value={aThreshold} onChange={(e) => { setAThreshold(Number(e.target.value)); setReportGenerated(false); }} /><span>{aType === "Percentage" ? "%" : "students"}</span></div></label>
              <label>Grade Range<GradeRangeSelect values={highGradeRange} options={["A+", "A", "B+", "B", "C+", "C", "D+"]} onChange={(values) => { setHighGradeRange(values); setReportGenerated(false); }} /></label>
            </div>
            <p>Flag {reportMode === "course" ? "courses" : "sections"} where at least <strong>{aThreshold}{aType === "Percentage" ? "%" : " students"}</strong> {aType === "Percentage" ? "of students " : ""}received A or A+.</p>
          </article>
          <article className="grade-classification-rule grade-classification-rule--difficult">
            <h3>{reportMode === "course" ? "Courses with Low Average Performance" : "Sections with Low Average Performance"}</h3>
            <div className="grade-classification-rule__controls">
              <label>Threshold Type<div className="grade-segment">{(["Percentage", "Student Count"] as DisplayMode[]).map((type) => <button className={riskType === type ? "active" : ""} onClick={() => { setRiskType(type); setReportGenerated(false); }} key={type}>{type}</button>)}</div></label>
              <label>Threshold Value<div><input type="number" min="0" max={riskType === "Percentage" ? 100 : undefined} value={riskThreshold} onChange={(e) => { setRiskThreshold(Number(e.target.value)); setReportGenerated(false); }} /><span>{riskType === "Percentage" ? "%" : "students"}</span></div></label>
              <label>Grade Range<GradeRangeSelect values={lowGradeRange} options={["C+", "C", "D+", "D", "F", "W"]} onChange={(values) => { setLowGradeRange(values); setReportGenerated(false); }} /></label>
            </div>
            <p>Flag {reportMode === "course" ? "courses" : "sections"} where at least <strong>{riskThreshold}{riskType === "Percentage" ? "%" : " students"}</strong> {riskType === "Percentage" ? "of students " : ""}received D+ or D &amp; Below.</p>
          </article>
        </div>
        <div className="grade-ranking-controls">
          <label className="grade-minimum-students">Minimum Students per {reportMode === "course" ? "Course Group" : "Section"}<div><input type="number" min="1" value={minimumStudents} onChange={(e) => { setMinimumStudents(Number(e.target.value)); setReportGenerated(false); }} /><span>students</span></div></label>
          {reportMode === "section" && <label className="grade-minimum-students">Section Variation Threshold<div><input type="number" min="0" max="100" value={variationThreshold} onChange={(e) => { setVariationThreshold(Math.max(0, Number(e.target.value))); setReportGenerated(false); }} /><span>percentage points</span></div></label>}
        </div>
        <div className="grade-criteria-note"><MiniIcon name="alert" /><span>Report results show both student counts and percentages. These illustrative rules are not official PMU academic standards.</span></div>
        <div className="grade-report-action"><span>High range ≥ {aThreshold}{aType === "Percentage" ? "%" : " students"} · Low range ≥ {riskThreshold}{riskType === "Percentage" ? "%" : " students"} · Minimum {minimumStudents} students{reportMode === "section" ? ` · Variation ≥ ${variationThreshold} pp` : ""}</span><div><button className="grade-button grade-button--secondary" disabled={!reportGenerated} onClick={() => { setSelectedEmailCourses(emailReportCourses); setReviewEmailDrafts(false); setShowEmailPanel(true); }}><MiniIcon name="upload" /> Send report by email</button><button className="grade-button grade-button--primary" onClick={() => setReportGenerated(true)}><MiniIcon name="chart" /> Generate Report</button></div></div>
      </section>
      </div>

      {reportGenerated && <>
      <div className="grade-report-campus-view grade-panel"><span>Campus View</span><div className="grade-segment">{["All", "Male", "Female"].map((campus) => <button className={filters.campus === campus ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, campus }))} key={campus}>{campus}</button>)}</div></div>
      {reportMode === "course" ? <>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--easy">
        <div className="grade-report-section-heading"><span>02</span><div><h2>Courses with High Average Performance</h2><p>Courses meeting the configured grade-range threshold.</p></div><select value={topCourseCount} onChange={(e) => setTopCourseCount(Number(e.target.value))}>{[5,10,15,20,9999].map((count) => <option key={count} value={count}>{count === 9999 ? "All" : `Top ${count}`}</option>)}</select><b>{Math.min(reportPotentiallyEasy.length, topCourseCount)} courses</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course</th><th>Selected Grade Range Outcome</th><th>Grade Distribution</th></tr></thead><tbody>{reportPotentiallyEasy.slice(0, topCourseCount).map((record) => { const count = gradeRangeCount(record, highGradeRange); return <tr key={`easy-${record.course}`}><td><strong>{record.course} — {record.title}</strong></td><td><span className="grade-signal grade-signal--easy">{count} of {record.totalStudents} students ({percent(count, record).toFixed(1)}%)</span></td><td className="grade-distribution-summary">{grades.map((grade) => `${gradeLabels[grade as Exclude<Grade, "P">]} ${record.grades[grade]} (${percent(record.grades[grade], record).toFixed(1)}%)`).join(" · ")}</td></tr>; })}</tbody></table></div>
        {!reportPotentiallyEasy.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No courses meet the potentially easy rule</strong>Adjust the criteria or broaden the filters to review another selection.</span></div>}
      </section>

      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--difficult">
        <div className="grade-report-section-heading"><span>03</span><div><h2>Courses with Low Average Performance</h2><p>Courses meeting the configured low-performance grade range.</p></div><select value={atRiskCourseCount} onChange={(e) => setAtRiskCourseCount(Number(e.target.value))}>{[5,10,15,20,9999].map((count) => <option key={count} value={count}>{count === 9999 ? "All" : `Top ${count}`}</option>)}</select><b>{Math.min(reportPotentiallyDifficult.length, atRiskCourseCount)} courses</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course</th><th>Selected Grade Range Outcome</th><th>Passing Outcome</th><th>Withdrawal Outcome</th></tr></thead><tbody>{reportPotentiallyDifficult.slice(0, atRiskCourseCount).map((record) => { const lowGradeCount = gradeRangeCount(record, lowGradeRange); const passingCount = passingGrades(record); return <tr key={`difficult-${record.course}`}><td><strong>{record.course} — {record.title}</strong></td><td><span className="grade-signal grade-signal--difficult">{lowGradeCount} of {record.totalStudents} students ({percent(lowGradeCount, record).toFixed(1)}%)</span></td><td>{passingCount} of {record.totalStudents} ({passingRate(record).toFixed(1)}%)</td><td>{record.grades.W} of {record.totalStudents} ({percent(record.grades.W, record).toFixed(1)}%)</td></tr>; })}</tbody></table></div>
        {!reportPotentiallyDifficult.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No courses meet the potentially difficult rule</strong>Adjust the criteria or broaden the filters to review another selection.</span></div>}
      </section>

      </> : <>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--easy">
        <div className="grade-report-section-heading"><span>02</span><div><h2>Sections with High Average Performance</h2><p>Sections meeting the configured grade-range threshold.</p></div><select value={topSectionCount} onChange={(e) => setTopSectionCount(Number(e.target.value))}>{[5,10,15,20,9999].map((count) => <option key={count} value={count}>{count === 9999 ? "All" : `Top ${count}`}</option>)}</select><b>{topPerformingSections.length} sections</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Rank</th><th>Course / Section</th><th>Course Name</th><th>Instructor</th><th>Students</th><th>Selected Grade Range Outcome</th></tr></thead><tbody>{topPerformingSections.map((record, index) => { const count = gradeRangeCount(record, highGradeRange); return <tr key={`top-section-${cohortKey(record)}`}><td><strong>#{index + 1}</strong></td><td><strong>{record.course} · Section {record.section}</strong></td><td>{record.title}</td><td>{record.instructor}</td><td>{record.totalStudents}</td><td><span className="grade-signal grade-signal--easy">{count} of {record.totalStudents} ({percent(count, record).toFixed(1)}%)</span></td></tr>; })}</tbody></table></div>
      </section>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--difficult">
        <div className="grade-report-section-heading"><span>03</span><div><h2>Sections with Low Average Performance</h2><p>Sections meeting the configured low-performance grade range.</p></div><select value={atRiskSectionCount} onChange={(e) => setAtRiskSectionCount(Number(e.target.value))}>{[5,10,15,20,9999].map((count) => <option key={count} value={count}>{count === 9999 ? "All" : `Top ${count}`}</option>)}</select><b>{atRiskSections.length} sections</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Rank</th><th>Course / Section</th><th>Course Name</th><th>Instructor</th><th>Students</th><th>Selected Grade Range Outcome</th></tr></thead><tbody>{atRiskSections.map((record, index) => { const lowGrades = gradeRangeCount(record, lowGradeRange); return <tr key={`risk-section-${cohortKey(record)}`}><td><strong>#{index + 1}</strong></td><td><strong>{record.course} · Section {record.section}</strong></td><td>{record.title}</td><td>{record.instructor}</td><td>{record.totalStudents}</td><td><span className="grade-signal grade-signal--difficult">{lowGrades} of {record.totalStudents} ({percent(lowGrades, record).toFixed(1)}%)</span></td></tr>; })}</tbody></table></div>
      </section>
      <section className="grade-panel grade-report grade-detailed-summary">
        <div className="grade-report-section-heading"><span>04</span><div><h2>Section Grade Variation Analysis</h2><p>Combined A+/A and Combined D+ &amp; Below (D+, D, and F) · highest-to-lowest differences of {variationThreshold} percentage points or more.</p></div><b>{notableSectionDifferences.length} findings</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course</th><th>Course Name</th><th>Grade Measure</th><th>Highest Section</th><th>Lowest Section</th><th>Difference</th></tr></thead><tbody>{notableSectionDifferences.map((item) => <tr key={`${item.course}-${item.measure}`}><td><strong>{item.course}</strong></td><td>{item.title}</td><td><strong>{item.measure}</strong></td><td>Section {item.highest.record.section} · {item.highest.record.campus} · {item.highest.record.totalStudents} students · {item.highest.rate.toFixed(1)}%</td><td>Section {item.lowest.record.section} · {item.lowest.record.campus} · {item.lowest.record.totalStudents} students · {item.lowest.rate.toFixed(1)}%</td><td><span className="grade-gap">{item.difference.toFixed(1)} pp</span></td></tr>)}</tbody></table></div>
        {!notableSectionDifferences.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No notable section variations</strong>No grade measure differs by {variationThreshold} percentage points or more.</span></div>}
      </section>
      </>}
      </>}
      </>}
      {showEmailPanel && <div className="grade-email-backdrop" onMouseDown={() => setShowEmailPanel(false)}>
        <aside className="grade-email-drawer" onMouseDown={(event) => event.stopPropagation()}>
          <div className="grade-email-head"><div><span>Email delivery</span><h2>Send grade reports</h2><p>Select courses, review one draft per course, then send through Outlook.</p></div><button onClick={() => setShowEmailPanel(false)} aria-label="Close">×</button></div>
          {!reviewEmailDrafts ? <>
            <label className="grade-email-field">Sender<input value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} /></label>
            <label className="grade-email-field">Department chairs (CC)<textarea value={chairEmails} onChange={(event) => setChairEmails(event.target.value)} rows={3} /></label>
            <div className="grade-email-course-list">{emailReportCourses.map((course) => <label key={course}><input type="checkbox" checked={selectedEmailCourses.includes(course)} onChange={() => setSelectedEmailCourses((current) => current.includes(course) ? current.filter((item) => item !== course) : [...current, course])} /><span><strong>{course}</strong><small>{sections.find((record) => record.course === course)?.title}</small></span></label>)}</div>
            <button className="grade-button grade-button--primary" disabled={!selectedEmailCourses.length} onClick={() => setReviewEmailDrafts(true)}>Review {selectedEmailCourses.length} email {selectedEmailCourses.length === 1 ? "draft" : "drafts"}</button>
          </> : <>
            <button className="grade-email-back" onClick={() => setReviewEmailDrafts(false)}>Back to course selection</button>
            <div className="grade-email-drafts">{selectedEmailCourses.map((course) => { const draft = buildCourseEmail(course); return <article key={course}><div><strong>{draft.subject}</strong><small>To: {draft.to.join(", ") || "No directory email found"}</small>{draft.missingRecipients.length > 0 && <small>Missing: {draft.missingRecipients.join(", ")}</small>}<small>CC: {chairEmails}</small></div><pre>{draft.body}</pre>{draft.to.length > 0 && <a target="_blank" rel="noreferrer" href={`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(draft.to.join(";"))}&cc=${encodeURIComponent(chairEmails)}&subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}>Open Outlook draft</a>}</article>; })}</div>
            <button className="grade-button grade-button--primary" disabled={sendingEmails || selectedEmailCourses.some((course) => buildCourseEmail(course).missingRecipients.length > 0)} onClick={() => void sendReportEmails()}>{sendingEmails ? "Sending…" : `Send ${selectedEmailCourses.length} emails`}</button>
          </>}
        </aside>
      </div>}
    </div>
  );
}
