import { Fragment, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { type Grade, type GradeRecord } from "./gradeData";
import { sectionGradeData, type SectionGradeRecord } from "./sectionGradeData";

type DisplayMode = "Student Count" | "Percentage";
type ReportMode = "course" | "section";
type ChartSeries = Pick<GradeRecord, "department" | "course" | "title" | "campus" | "totalStudents" | "grades"> & { label: string; section?: string; instructor?: string };

const grades: Grade[] = ["A+", "A", "B+", "B", "C+", "C", "D+", "D&Below", "W"];
const allGrades: Grade[] = [...grades, "P"];
const gradeColors = ["#258C70", "#34805B", "#3E78CE", "#315FC5", "#D17829", "#B86428", "#D75A2B", "#C73C3C", "#7E6C91"];
const sectionColors = ["#2E78A4", "#D85E9C"];
const semesterLabels: Record<string, string> = { "202510": "Fall 2025" };
const variationMeasureOptions = ["A+", "A", "B+", "B", "C+", "C", "D+", "D & Below", "W", "Combined A/A+", "D+ & Below"];
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

const total = (record: GradeRecord) => record.totalStudents;
const percent = (count: number, record: GradeRecord) => record.totalStudents ? (count / record.totalStudents) * 100 : 0;
const highGrades = (record: GradeRecord) => record.grades["A+"] + record.grades.A;
const passingGrades = (record: GradeRecord) => record.grades["A+"] + record.grades.A + record.grades["B+"] + record.grades.B + record.grades["C+"] + record.grades.C + record.grades.P + record.grades["D+"];
const passingRate = (record: GradeRecord) => percent(passingGrades(record), record);
const campusName = (record: GradeRecord) => record.campus.replace(" Campus", "");
const cohortKey = (record: GradeRecord | SectionGradeRecord) => `${record.course}|${record.title}|${record.campus}|${"section" in record ? record.section : ""}`;
const campusColor = (record: GradeRecord) => record.campus === "Male Campus" ? sectionColors[0] : sectionColors[1];
const chartSeriesColor = (record: ChartSeries) => {
  if (!record.section) return campusColor(record);
  const hash = `${record.course}|${record.section}|${record.campus}`.split("").reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  const hue = record.campus === "Male Campus" ? 202 + (hash % 20) : 300 + (hash % 34);
  const saturation = 48 + ((hash >> 4) % 25);
  const lightness = 36 + ((hash >> 9) % 28);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
};
const sectionKey = (record: SectionGradeRecord) => `${record.campus}|${record.course}|${record.section}`;
const sectionLabel = (record: SectionGradeRecord) => `Section ${record.section} · ${record.campus.replace(" Campus", "")}`;
const courseOptions = [...new Set(sectionGradeData.map((record) => record.course))]
  .map((course) => {
    const records = sectionGradeData.filter((record) => record.course === course);
    return {
      value: course,
      course,
      title: [...new Set(records.map((record) => record.title))].join(" / "),
      department: records[0].department,
    };
  })
  .sort((a, b) => a.course.localeCompare(b.course));
const departmentOptions = [...new Set(sectionGradeData.map((record) => record.department))].sort();

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

export default function GradeAnalysis() {
  const [activePanel, setActivePanel] = useState<"analysis" | "report">("analysis");
  const [reportMode, setReportMode] = useState<ReportMode>("course");
  const [filters, setFilters] = useState({ semester: "202510", department: "All", course: "GEIT 1411", instructor: "All", campus: "All", mode: "Student Count" as DisplayMode });
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [aType, setAType] = useState<DisplayMode>("Percentage");
  const [aThreshold, setAThreshold] = useState(40);
  const [riskType, setRiskType] = useState<DisplayMode>("Percentage");
  const [riskThreshold, setRiskThreshold] = useState(30);
  const [minimumStudents, setMinimumStudents] = useState(10);
  const [topCourseCount, setTopCourseCount] = useState(5);
  const [atRiskCourseCount, setAtRiskCourseCount] = useState(5);
  const [variationThreshold, setVariationThreshold] = useState(15);
  const [variationMeasureFilter, setVariationMeasureFilter] = useState("All Grade Measures");
  const [sectionRankingCount, setSectionRankingCount] = useState(5);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"campus" | "total" | "department" | "course" | "title">("course");
  const [sortAsc, setSortAsc] = useState(true);

  const instructorOptions = useMemo(() => [...new Set(sectionGradeData.filter((item) =>
    item.semester === filters.semester &&
    (filters.department === "All" || item.department === filters.department) &&
    (filters.course === "All" || item.course === filters.course)
  ).map((item) => item.instructor))].sort(), [filters.course, filters.department, filters.semester]);

  const availableSections = useMemo(() => sectionGradeData.filter((item) =>
    item.semester === filters.semester &&
    (filters.department === "All" || item.department === filters.department) &&
    (filters.course === "All" || item.course === filters.course) &&
    (filters.instructor === "All" || item.instructor === filters.instructor) &&
    (filters.campus === "All" || item.campus.startsWith(filters.campus))
  ), [filters.campus, filters.course, filters.department, filters.instructor, filters.semester]);

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
    return [...sections]
      .sort((a, b) => Number(a.campus.startsWith("Female")) - Number(b.campus.startsWith("Female")) || a.section.localeCompare(b.section, undefined, { numeric: true }))
      .map((record) => ({
        ...record,
        grades: { ...record.grades },
        label: sectionLabel(record),
        section: record.section,
        instructor: record.instructor,
      }));
  }, [sections]);
  const chartCampusGroups = useMemo(() => (["Male Campus", "Female Campus"] as const)
    .map((campus) => ({ campus, series: chartSeries.filter((item) => item.campus === campus) }))
    .filter((group) => group.series.length), [chartSeries]);
  const maxCount = Math.max(1, ...grades.map((grade) => chartSeries.reduce((sum, section) => sum + section.grades[grade], 0)));
  const maxPercentage = Math.max(10, Math.min(100, Math.ceil(Math.max(...grades.map((grade) => studentTotal ? chartSeries.reduce((sum, section) => sum + section.grades[grade], 0) / studentTotal * 100 : 0), 0) / 10) * 10));

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
  const topPerformingCourses = useMemo(() => [...rankedCourses]
    .sort((a, b) => percent(highGrades(b), b) - percent(highGrades(a), a))
    .slice(0, topCourseCount), [rankedCourses, topCourseCount]);
  const atRiskCourses = useMemo(() => [...rankedCourses]
    .sort((a, b) => percent(b.grades.W, b) - percent(a.grades.W, a))
    .slice(0, atRiskCourseCount), [atRiskCourseCount, rankedCourses]);
  const reportRecords = reportMode === "course" ? rankedCourses : sections;
  const reportPotentiallyEasy = useMemo(() => reportRecords
    .filter((record) => {
      const value = aType === "Percentage" ? percent(highGrades(record), record) : highGrades(record);
      return record.totalStudents >= minimumStudents && value >= aThreshold;
    })
    .sort((a, b) => percent(highGrades(b), b) - percent(highGrades(a), a)), [aThreshold, aType, minimumStudents, reportRecords]);
  const reportPotentiallyDifficult = useMemo(() => reportRecords
    .filter((record) => {
      const lowGradeCount = record.grades["D+"] + record.grades["D&Below"];
      const value = riskType === "Percentage" ? percent(lowGradeCount, record) : lowGradeCount;
      return record.totalStudents >= minimumStudents && value >= riskThreshold;
    })
    .sort((a, b) => percent(b.grades["D+"] + b.grades["D&Below"], b) - percent(a.grades["D+"] + a.grades["D&Below"], a)), [minimumStudents, reportRecords, riskThreshold, riskType]);
  const allNotableSectionDifferences = useMemo(() => {
    const grouped = new Map<string, SectionGradeRecord[]>();
    sections.forEach((record) => grouped.set(record.course, [...(grouped.get(record.course) ?? []), record]));
    return [...grouped.entries()].flatMap(([course, records]) => {
      if (records.length < 2) return [];
      const measures = [
        ...grades.map((grade) => ({ label: grade === "D&Below" ? "D & Below" : gradeLabels[grade as Exclude<Grade, "P">], count: (record: SectionGradeRecord) => record.grades[grade] })),
        { label: "Combined A/A+", count: (record: SectionGradeRecord) => highGrades(record) },
        { label: "D+ & Below", count: (record: SectionGradeRecord) => record.grades["D+"] + record.grades["D&Below"] },
      ];
      return measures.map((measure) => {
        const ranked = records.map((record) => ({ record, rate: percent(measure.count(record), record) })).sort((a, b) => b.rate - a.rate);
        return { course, title: records[0].title, measure: measure.label, highest: ranked[0], lowest: ranked[ranked.length - 1], difference: ranked[0].rate - ranked[ranked.length - 1].rate };
      }).filter((item) => item.difference >= variationThreshold);
    }).sort((a, b) => b.difference - a.difference);
  }, [sections, variationThreshold]);
  const notableSectionDifferences = useMemo(() =>
    allNotableSectionDifferences.filter((item) =>
      variationMeasureFilter === "All Grade Measures" || item.measure === variationMeasureFilter
    ), [allNotableSectionDifferences, variationMeasureFilter]);
  const reviewSections = useMemo(() => {
    const variationReviewKeys = new Set(allNotableSectionDifferences.flatMap((item) =>
      ["A+", "A", "Combined A/A+"].includes(item.measure)
        ? [sectionKey(item.lowest.record)]
        : ["D+", "D & Below", "D+ & Below", "W"].includes(item.measure)
          ? [sectionKey(item.highest.record)]
          : []
    ));
    return sections.filter((record) => {
      const lowGradeCount = record.grades["D+"] + record.grades["D&Below"];
      const lowValue = riskType === "Percentage" ? percent(lowGradeCount, record) : lowGradeCount;
      return record.totalStudents >= minimumStudents && (lowValue >= riskThreshold || percent(record.grades.W, record) >= 15 || variationReviewKeys.has(sectionKey(record)));
    }).sort((a, b) => percent(b.grades["D+"] + b.grades["D&Below"] + b.grades.W, b) - percent(a.grades["D+"] + a.grades["D&Below"] + a.grades.W, a));
  }, [allNotableSectionDifferences, minimumStudents, riskThreshold, riskType, sections]);
  const topPerformingSections = useMemo(() => [...sections]
    .sort((a, b) => percent(highGrades(b), b) - percent(highGrades(a), a))
    .slice(0, sectionRankingCount), [sectionRankingCount, sections]);
  const highestWithdrawalSections = useMemo(() => [...sections]
    .sort((a, b) => percent(b.grades.W, b) - percent(a.grades.W, a))
    .slice(0, sectionRankingCount), [sectionRankingCount, sections]);
  
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const courseReportLines = [
    "PMU - CCES",
    "Course Difficulty & Ease Analysis Report",
    `Scope: ${selectedCourseCount} courses, ${studentTotal} students`,
    `Filters: Semester ${semesterLabels[filters.semester] ?? filters.semester}; Department ${filters.department}; Course ${filters.course}; Instructor ${filters.instructor}; Campus ${filters.campus}; Sections ${selectedSections.length ? selectedSections.length : "All"}`,
    `Potentially easy threshold: A/A+ >= ${aThreshold}${aType === "Percentage" ? "%" : " students"}`,
    `Potentially difficult threshold: D+ & Below >= ${riskThreshold}${riskType === "Percentage" ? "%" : " students"}`,
    `Minimum students per course group: ${minimumStudents}`,
    "",
    `Potentially Easy Courses (${reportPotentiallyEasy.length})`,
    ...reportPotentiallyEasy.map((record) => `${record.course} - ${record.title} | ${filters.campus === "All" ? "Combined Male + Female" : record.campus} | ${highGrades(record)} of ${record.totalStudents} students (${percent(highGrades(record), record).toFixed(1)}%) earned A/A+`),
    "",
    `Potentially Difficult Courses (${reportPotentiallyDifficult.length})`,
    ...reportPotentiallyDifficult.map((record) => {
      const lowGradeCount = record.grades["D+"] + record.grades["D&Below"];
      return `${record.course} - ${record.title} | ${filters.campus === "All" ? "Combined Male + Female" : record.campus} | D+ & Below: ${lowGradeCount} of ${record.totalStudents} (${percent(lowGradeCount, record).toFixed(1)}%) | Passing: ${passingGrades(record)} of ${record.totalStudents} (${passingRate(record).toFixed(1)}%) | Withdrawal: ${record.grades.W} of ${record.totalStudents} (${percent(record.grades.W, record).toFixed(1)}%)`;
    }),
    "",
    `Top-performing Courses by A/A+ Percentage (${topPerformingCourses.length})`,
    ...topPerformingCourses.map((record, index) => `${index + 1}. ${record.course} - ${record.title} | A/A+: ${percent(highGrades(record), record).toFixed(1)}% (${highGrades(record)} of ${record.totalStudents})`),
    "",
    `At-risk Courses by Withdrawal Rate (${atRiskCourses.length})`,
    ...atRiskCourses.map((record, index) => `${index + 1}. ${record.course} - ${record.title} | Withdrawal: ${percent(record.grades.W, record).toFixed(1)}% (${record.grades.W} of ${record.totalStudents})`),
    "",
    "These configurable rules are illustrative and are not official PMU academic standards.",
  ];
  const sectionReportLines = [
    "PMU - CCES",
    "Section-Level Grade Analysis Report",
    `Scope: ${sections.length} sections, ${studentTotal} students`,
    `Filters: Semester ${semesterLabels[filters.semester] ?? filters.semester}; Department ${filters.department}; Course ${filters.course}; Instructor ${filters.instructor}; Campus ${filters.campus}; Sections ${selectedSections.length ? selectedSections.length : "All"}`,
    "",
    `Top-performing Sections by Combined A/A+ (${topPerformingSections.length})`,
    ...topPerformingSections.map((record, index) => `${index + 1}. ${record.course} - ${record.title} | Section ${record.section} | ${record.campus} | ${record.totalStudents} students | A/A+ ${percent(highGrades(record), record).toFixed(1)}%`),
    "",
    `Sections with Highest Withdrawal Rates (${highestWithdrawalSections.length})`,
    ...highestWithdrawalSections.map((record, index) => `${index + 1}. ${record.course} - ${record.title} | Section ${record.section} | ${record.campus} | ${record.totalStudents} students | Withdrawal ${percent(record.grades.W, record).toFixed(1)}%`),
    "",
    `Variation Grade Measure Filter: ${variationMeasureFilter}`,
    `Section Grade Variation Analysis >= ${variationThreshold} percentage points (${notableSectionDifferences.length})`,
    ...notableSectionDifferences.map((item) => `${item.course} - ${item.title} | ${item.measure}: ${item.difference.toFixed(1)} pp | Section ${item.highest.record.section} (${item.highest.record.campus}, ${item.highest.record.totalStudents} students) ${item.highest.rate.toFixed(1)}% vs Section ${item.lowest.record.section} (${item.lowest.record.campus}, ${item.lowest.record.totalStudents} students) ${item.lowest.rate.toFixed(1)}%`),
    "",
    `Sections Requiring Academic Review (${reviewSections.length})`,
    ...reviewSections.map((record) => `${record.course} Section ${record.section} | ${record.campus} | D+ & Below ${percent(record.grades["D+"] + record.grades["D&Below"], record).toFixed(1)}% | Withdrawal ${percent(record.grades.W, record).toFixed(1)}%`),
  ];
  const reportLines = reportMode === "course" ? courseReportLines : sectionReportLines;

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Setting: "College", Value: "CCES" },
      { Setting: "Report View", Value: reportMode === "course" ? "By Course" : "By Section" },
      { Setting: "Semester", Value: semesterLabels[filters.semester] ?? filters.semester },
      { Setting: "Department", Value: filters.department },
      { Setting: "Course", Value: filters.course },
      { Setting: "Instructor", Value: filters.instructor },
      { Setting: "Campus", Value: filters.campus },
      { Setting: "Sections", Value: selectedSections.length ? selectedSections.length : "All Sections" },
      { Setting: "Potentially Easy Threshold", Value: aThreshold, Type: aType },
      { Setting: "Potentially Difficult Threshold", Value: riskThreshold, Type: riskType },
      { Setting: "Minimum Students", Value: minimumStudents },
      { Setting: "Top-performing Courses to Display", Value: topCourseCount },
      { Setting: "At-risk Courses to Display", Value: atRiskCourseCount },
      { Setting: "Section Variation Threshold", Value: variationThreshold, Type: "Percentage Points" },
      { Setting: "Variation Grade Measure", Value: variationMeasureFilter },
      { Setting: "Sections per Ranking", Value: sectionRankingCount },
    ]), "Criteria");
    if (reportMode === "section") {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(topPerformingSections.map((record, index) => ({
        Rank: index + 1,
        Course: record.course,
        "Course Name": record.title,
        Section: record.section,
        Campus: record.campus,
        Instructor: record.instructor,
        Students: record.totalStudents,
        "A/A+ Count": highGrades(record),
        "A/A+ Percentage": percent(highGrades(record), record) / 100,
      }))), "Top Sections");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(highestWithdrawalSections.map((record, index) => ({
        Rank: index + 1,
        Course: record.course,
        "Course Name": record.title,
        Section: record.section,
        Campus: record.campus,
        Instructor: record.instructor,
        Students: record.totalStudents,
        "Withdrawal Count": record.grades.W,
        "Withdrawal Rate": percent(record.grades.W, record) / 100,
      }))), "Withdrawal Sections");
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
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reviewSections.map((record) => ({
        Course: record.course,
        "Course Name": record.title,
        Section: record.section,
        Campus: record.campus,
        Instructor: record.instructor,
        Students: record.totalStudents,
        "D+ & Below Rate": percent(record.grades["D+"] + record.grades["D&Below"], record) / 100,
        "Withdrawal Rate": percent(record.grades.W, record) / 100,
      }))), "Academic Review");
      XLSX.writeFileXLSX(workbook, "PMU_CCES_Section_Grade_Analysis_Report.xlsx");
      return;
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportPotentiallyEasy.map((record) => ({
      Department: record.department,
      Course: record.course,
      Title: record.title,
      Campus: filters.campus === "All" ? "Combined Male + Female" : record.campus,
      Students: record.totalStudents,
      "A/A+ Count": highGrades(record),
      "A/A+ Rate": percent(highGrades(record), record) / 100,
      ...record.grades,
    }))), "Potentially Easy");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportPotentiallyDifficult.map((record) => {
      const lowGradeCount = record.grades["D+"] + record.grades["D&Below"];
      return {
        Department: record.department,
        Course: record.course,
        Title: record.title,
        Campus: record.campus,
        Students: record.totalStudents,
        "D+ & Below Count": lowGradeCount,
        "D+ & Below Rate": percent(lowGradeCount, record) / 100,
        "Passing Rate": passingRate(record) / 100,
        "Withdrawal Rate": percent(record.grades.W, record) / 100,
      };
    })), "Potentially Difficult");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(topPerformingCourses.map((record, index) => ({
      Rank: index + 1,
      Course: record.course,
      Title: record.title,
      Students: record.totalStudents,
      "A/A+ Count": highGrades(record),
      "A/A+ Percentage": percent(highGrades(record), record) / 100,
    }))), "Top Performing");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(atRiskCourses.map((record, index) => ({
      Rank: index + 1,
      Course: record.course,
      Title: record.title,
      Students: record.totalStudents,
      "Withdrawal Count": record.grades.W,
      "Withdrawal Rate": percent(record.grades.W, record) / 100,
    }))), "Withdrawal Risk");
    XLSX.writeFileXLSX(workbook, "PMU_CCES_Course_Difficulty_Ease_Report.xlsx");
  };

  const renderFilterControls = () => (
    <section className="grade-filters grade-panel">
      <div className="grade-filter-field"><label>Semester</label><select value={filters.semester} onChange={(e) => { setReportGenerated(false); setFilters((current) => ({ ...current, semester: e.target.value })); }}>{[...new Set(sectionGradeData.map((record) => record.semester))].map((semester) => <option key={semester} value={semester}>{semesterLabels[semester] ?? semester}</option>)}</select></div>
      <div className="grade-filter-field"><label>College</label><select value="CCES" disabled><option>CCES</option></select></div>
      <div className="grade-filter-field"><label>Department</label><select value={filters.department} onChange={(e) => { setReportGenerated(false); setFilters((current) => ({ ...current, department: e.target.value })); }}><option value="All">All Departments</option>{departmentOptions.map((department) => <option key={department}>{department}</option>)}</select></div>
      <div className="grade-filter-field"><label>Course</label><select value={filters.course} onChange={(e) => { setReportGenerated(false); setFilters((current) => ({ ...current, course: e.target.value })); }}><option value="All">All Courses</option>{courseOptions.filter((option) => filters.department === "All" || option.department === filters.department || option.value === filters.course).map((option) => <option key={option.value} value={option.value}>{option.course} — {option.title}</option>)}</select></div>
      <div className="grade-filter-field"><label>Instructor</label><select value={filters.instructor} onChange={(e) => { setReportGenerated(false); setFilters((current) => ({ ...current, instructor: e.target.value })); }}><option value="All">All Instructors</option>{filters.instructor !== "All" && !instructorOptions.includes(filters.instructor) && <option>{filters.instructor}</option>}{instructorOptions.map((instructor) => <option key={instructor}>{instructor}</option>)}</select></div>
      <div className="grade-filter-field grade-section-filter">
        <label>Section</label>
        <details>
          <summary>{selectedSections.length ? `${selectedSections.length} Sections Selected` : "All Sections"}</summary>
          <div className="grade-section-filter__menu">
            {filters.course === "All" ? <span>Select a course to view sections.</span> : <>
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
      <div className="grade-filter-actions"><button className="grade-reset" onClick={() => { setSelectedSections([]); setReportGenerated(false); setFilters({ semester: "202510", department: "All", course: "All", instructor: "All", campus: "All", mode: "Student Count" }); }}>Reset</button></div>
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
      </section>

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
        <div className="grade-card-heading"><div><h2>Grade Distribution Across Letter Grades</h2><p>Stacked distribution for {sections.length} filtered {sections.length === 1 ? "section" : "sections"} and {studentTotal.toLocaleString()} students across {filters.campus === "All" ? "Male and Female campuses" : `${filters.campus} Campus`} on the {filters.mode} scale.</p></div><div className="grade-chart-actions"><div className="grade-chart-campus-filter"><span>Campus</span><div className="grade-segment">{["All", "Male", "Female"].map((campus) => <button className={filters.campus === campus ? "active" : ""} onClick={() => { setReportGenerated(false); setFilters((current) => ({ ...current, campus })); }} key={campus}>{campus}</button>)}</div></div><MetricToggle mode={filters.mode} onChange={(mode) => setFilters((current) => ({ ...current, mode }))} /><div className="grade-chart-legend grade-chart-legend--grouped">{chartCampusGroups.map((group) => <div className={`grade-chart-legend__campus grade-chart-legend__campus--${group.campus.startsWith("Male") ? "male" : "female"}`} key={group.campus}><strong>{group.campus}</strong><div>{group.series.map((section) => <span key={section.label}><i style={{ background: chartSeriesColor(section) }} /><span className="grade-chart-legend__details"><b>{section.section ? `Section ${section.section}` : section.label}</b><small>{section.instructor ? `${section.instructor} · ` : ""}{section.totalStudents.toLocaleString()} students</small></span></span>)}</div></div>)}</div></div></div>
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
                      return <div className={`grade-bar grade-bar--stacked grade-bar--${section.campus.startsWith("Male") ? "male" : "female"}`} key={section.label} style={{ height: `${Math.max(count ? 1 : 0, chartValue * 100)}%`, background: chartSeriesColor(section) }} tabIndex={0}><span className="grade-stack-value">{displayValue}</span><GradeTooltip record={section} grade={grade as Exclude<Grade, "P">} seriesLabel={section.label} instructor={section.instructor} selectionTotal={studentTotal} /></div>;
                    })}
                  </div>
                </div>
                <span className="grade-category"><strong style={{ color: gradeColors[gradeIndex] }}>{gradeLabels[grade as Exclude<Grade, "P">]}</strong></span>
              </div>
            ))}
          </div>
        </div>
        <div className="grade-x-label">Grade category</div>
      </section>

      <section className="grade-panel grade-table-card">
        <div className="grade-card-heading"><div><h2>Course, Campus &amp; Section Breakdown</h2><p>Full section workbook data with counts and percentages for key grade outcomes</p></div><span className="grade-table-count">{sections.length} section records</span></div>
        <div className="grade-table-scroll"><table><thead><tr>
          <th><button onClick={() => toggleSort("department")}>Department {sortKey === "department" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th><button onClick={() => toggleSort("course")}>Course {sortKey === "course" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th><button onClick={() => toggleSort("title")}>Course Title {sortKey === "title" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th><button onClick={() => toggleSort("campus")}>Campus {sortKey === "campus" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          <th>Section</th><th>Instructor</th>
          <th><button onClick={() => toggleSort("total")}>Total {sortKey === "total" ? (sortAsc ? "↑" : "↓") : ""}</button></th>
          {(["A+", "A", "D+", "D&Below", "W"] as Grade[]).map((grade) => <th key={grade}>{grade === "D&Below" ? "D & F" : grade} Count / Percentage</th>)}<th>Record Chart</th>
        </tr></thead><tbody>{sections.map((section) => { const key = cohortKey(section); const expanded = expandedCohort === key; return <Fragment key={key}><tr><td>{section.department}</td><td><strong>{section.course}</strong></td><td>{section.title}</td><td><span className={`grade-campus grade-campus--${section.campus.startsWith("Male") ? "male" : "female"}`}>{section.campus}</span></td><td><strong>{section.section}</strong></td><td>{section.instructor}</td><td><strong>{total(section)}</strong></td>{(["A+", "A", "D+", "D&Below", "W"] as Grade[]).map((grade) => <td key={grade}><strong>{section.grades[grade]}</strong><span>{percent(section.grades[grade], section).toFixed(1)}%</span></td>)}<td><button className={`grade-chart-toggle ${expanded ? "active" : ""}`} onClick={() => setExpandedCohort(expanded ? null : key)}><MiniIcon name="chart" />{expanded ? "Hide chart" : "View chart"}</button></td></tr>{expanded && <tr className="grade-expanded-row"><td colSpan={13}><CohortChart initialRecord={section} initialMode={filters.mode} /></td></tr>}</Fragment>; })}</tbody></table></div>
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
      {renderFilterControls()}
      <div className="grade-report-mode grade-panel"><span>Report View</span><div className="grade-segment">{([{ value: "course", label: "By Course" }, { value: "section", label: "By Section" }] as const).map((option) => <button className={reportMode === option.value ? "active" : ""} onClick={() => { setReportMode(option.value); setReportGenerated(false); }} key={option.value}>{option.label}</button>)}</div></div>
      <section className="grade-panel grade-report grade-analysis-criteria">
        <div className="grade-report-section-heading"><span>01</span><div><h2>Analysis Criteria</h2><p>Choose when a course group should be flagged for academic review.</p></div></div>
        <div className="grade-classification-settings">
          <article className="grade-classification-rule grade-classification-rule--easy">
            <h3>Potentially Easy Courses</h3>
            <div className="grade-classification-rule__controls">
              <label>Threshold Type<div className="grade-segment">{(["Percentage", "Student Count"] as DisplayMode[]).map((type) => <button className={aType === type ? "active" : ""} onClick={() => { setAType(type); setReportGenerated(false); }} key={type}>{type}</button>)}</div></label>
              <label>Threshold Value<div><input type="number" min="0" max={aType === "Percentage" ? 100 : undefined} value={aThreshold} onChange={(e) => { setAThreshold(Number(e.target.value)); setReportGenerated(false); }} /><span>{aType === "Percentage" ? "%" : "students"}</span></div></label>
            </div>
            <p>Flag courses where at least <strong>{aThreshold}{aType === "Percentage" ? "%" : " students"}</strong> {aType === "Percentage" ? "of students " : ""}received A or A+.</p>
          </article>
          <article className="grade-classification-rule grade-classification-rule--difficult">
            <h3>Potentially Difficult Courses</h3>
            <div className="grade-classification-rule__controls">
              <label>Threshold Type<div className="grade-segment">{(["Percentage", "Student Count"] as DisplayMode[]).map((type) => <button className={riskType === type ? "active" : ""} onClick={() => { setRiskType(type); setReportGenerated(false); }} key={type}>{type}</button>)}</div></label>
              <label>Threshold Value<div><input type="number" min="0" max={riskType === "Percentage" ? 100 : undefined} value={riskThreshold} onChange={(e) => { setRiskThreshold(Number(e.target.value)); setReportGenerated(false); }} /><span>{riskType === "Percentage" ? "%" : "students"}</span></div></label>
            </div>
            <p>Flag courses where at least <strong>{riskThreshold}{riskType === "Percentage" ? "%" : " students"}</strong> {riskType === "Percentage" ? "of students " : ""}received D+ or D &amp; Below.</p>
          </article>
        </div>
        <div className="grade-ranking-controls">
          <label className="grade-minimum-students">Minimum Students per Course Group<div><input type="number" min="1" value={minimumStudents} onChange={(e) => { setMinimumStudents(Number(e.target.value)); setReportGenerated(false); }} /><span>students</span></div></label>
          <label className="grade-minimum-students">Top-performing Courses<div><input type="number" min="1" max="20" value={topCourseCount} onChange={(e) => { setTopCourseCount(Math.max(1, Number(e.target.value))); setReportGenerated(false); }} /><span>courses</span></div></label>
          <label className="grade-minimum-students">At-risk Courses<div><input type="number" min="1" max="20" value={atRiskCourseCount} onChange={(e) => { setAtRiskCourseCount(Math.max(1, Number(e.target.value))); setReportGenerated(false); }} /><span>courses</span></div></label>
          {reportMode === "section" && <label className="grade-minimum-students">Variation Threshold<div><input type="number" min="0" max="100" value={variationThreshold} onChange={(e) => { setVariationThreshold(Math.max(0, Number(e.target.value))); setReportGenerated(false); }} /><span>percentage points</span></div></label>}
          {reportMode === "section" && <label className="grade-minimum-students">Variation Grade Measure<div><select value={variationMeasureFilter} onChange={(e) => { setVariationMeasureFilter(e.target.value); setReportGenerated(false); }}><option>All Grade Measures</option>{variationMeasureOptions.map((measure) => <option key={measure}>{measure}</option>)}</select></div></label>}
          {reportMode === "section" && <label className="grade-minimum-students">Sections per Ranking<div><select value={sectionRankingCount} onChange={(e) => { setSectionRankingCount(Number(e.target.value)); setReportGenerated(false); }}><option value={2}>Top 2</option><option value={5}>Top 5</option><option value={10}>Top 10</option><option value={20}>Top 20</option></select></div></label>}
        </div>
        <div className="grade-criteria-note"><MiniIcon name="alert" /><span>Report results show both student counts and percentages. These illustrative rules are not official PMU academic standards.</span></div>
        <div className="grade-report-action"><span>Easy: A/A+ ≥ {aThreshold}{aType === "Percentage" ? "%" : " students"} · Difficult: D+ &amp; Below ≥ {riskThreshold}{riskType === "Percentage" ? "%" : " students"} · Minimum {minimumStudents} students{reportMode === "section" ? ` · Variation ≥ ${variationThreshold} pp · ${variationMeasureFilter}` : ""}</span><button className="grade-button grade-button--primary" onClick={() => setReportGenerated(true)}><MiniIcon name="chart" /> Generate Report</button></div>
      </section>
      </div>

      {reportGenerated && <>
      <div className="grade-report-campus-view grade-panel"><span>Campus View</span><div className="grade-segment">{["All", "Male", "Female"].map((campus) => <button className={filters.campus === campus ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, campus }))} key={campus}>{campus}</button>)}</div></div>
      {reportMode === "course" ? <>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--easy">
        <div className="grade-report-section-heading"><span>02</span><div><h2>Potentially Easy Courses</h2><p>High A/A+ grade concentration using aggregated student counts.</p></div><b>{reportPotentiallyEasy.length} courses</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course</th><th>Campus</th><th>A/A+ Outcome</th><th>Grade Distribution — Count &amp; Percentage</th></tr></thead><tbody>{reportPotentiallyEasy.map((record) => <tr key={`easy-${record.course}`}><td><strong>{record.course} — {record.title}</strong></td><td>{filters.campus === "All" ? <span className="grade-campus grade-campus--combined">Combined Male + Female</span> : <span className={`grade-campus grade-campus--${record.campus.startsWith("Male") ? "male" : "female"}`}>{record.campus}</span>}</td><td><span className="grade-signal grade-signal--easy">{highGrades(record)} of {record.totalStudents} students ({percent(highGrades(record), record).toFixed(1)}%) earned A/A+</span></td><td className="grade-distribution-summary">{grades.map((grade) => `${gradeLabels[grade as Exclude<Grade, "P">]} ${record.grades[grade]} (${percent(record.grades[grade], record).toFixed(1)}%)`).join(" · ")}</td></tr>)}</tbody></table></div>
        {!reportPotentiallyEasy.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No courses meet the potentially easy rule</strong>Adjust the criteria or broaden the filters to review another selection.</span></div>}
      </section>

      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--difficult">
        <div className="grade-report-section-heading"><span>03</span><div><h2>Potentially Difficult Courses</h2><p>High low-grade concentration with passing and withdrawal context.</p></div><b>{reportPotentiallyDifficult.length} courses</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course</th><th>Campus</th><th>D+ &amp; Below Outcome</th><th>Passing Outcome</th><th>Withdrawal Outcome</th></tr></thead><tbody>{reportPotentiallyDifficult.map((record) => { const lowGradeCount = record.grades["D+"] + record.grades["D&Below"]; const passingCount = passingGrades(record); return <tr key={`difficult-${record.course}`}><td><strong>{record.course} — {record.title}</strong></td><td>{filters.campus === "All" ? <span className="grade-campus grade-campus--combined">Combined Male + Female</span> : <span className={`grade-campus grade-campus--${record.campus.startsWith("Male") ? "male" : "female"}`}>{record.campus}</span>}</td><td><span className="grade-signal grade-signal--difficult">{lowGradeCount} of {record.totalStudents} students ({percent(lowGradeCount, record).toFixed(1)}%)</span></td><td>{passingCount} of {record.totalStudents} ({passingRate(record).toFixed(1)}%)</td><td>{record.grades.W} of {record.totalStudents} ({percent(record.grades.W, record).toFixed(1)}%)</td></tr>; })}</tbody></table></div>
        {!reportPotentiallyDifficult.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No courses meet the potentially difficult rule</strong>Adjust the criteria or broaden the filters to review another selection.</span></div>}
      </section>

      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--easy">
        <div className="grade-report-section-heading"><span>04</span><div><h2>Top-performing Courses</h2><p>Top {topCourseCount} courses ranked by combined A/A+ percentage.</p></div><b>{topPerformingCourses.length} courses</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Rank</th><th>Course</th><th>Students</th><th>A/A+ Count</th><th>Combined A/A+ Percentage</th></tr></thead><tbody>{topPerformingCourses.map((record, index) => <tr key={`top-${record.course}`}><td><strong>#{index + 1}</strong></td><td><strong>{record.course} — {record.title}</strong></td><td>{record.totalStudents}</td><td>{highGrades(record)}</td><td><span className="grade-signal grade-signal--easy">{percent(highGrades(record), record).toFixed(1)}%</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--difficult">
        <div className="grade-report-section-heading"><span>05</span><div><h2>At-risk Courses by Withdrawal</h2><p>Top {atRiskCourseCount} courses ranked by withdrawal rate.</p></div><b>{atRiskCourses.length} courses</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Rank</th><th>Course</th><th>Students</th><th>Withdrawals</th><th>Withdrawal Rate</th></tr></thead><tbody>{atRiskCourses.map((record, index) => <tr key={`risk-${record.course}`}><td><strong>#{index + 1}</strong></td><td><strong>{record.course} — {record.title}</strong></td><td>{record.totalStudents}</td><td>{record.grades.W}</td><td><span className="grade-signal grade-signal--difficult">{percent(record.grades.W, record).toFixed(1)}%</span></td></tr>)}</tbody></table></div>
      </section>
      </> : <>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--easy">
        <div className="grade-report-section-heading"><span>02</span><div><h2>Top-performing Sections</h2><p>Top {sectionRankingCount} sections ranked by combined A/A+ percentage.</p></div><b>{topPerformingSections.length} sections</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Rank</th><th>Course / Section</th><th>Course Name</th><th>Campus</th><th>Instructor</th><th>Students</th><th>A/A+ Outcome</th></tr></thead><tbody>{topPerformingSections.map((record, index) => <tr key={`top-section-${cohortKey(record)}`}><td><strong>#{index + 1}</strong></td><td><strong>{record.course} · Section {record.section}</strong></td><td>{record.title}</td><td><span className={`grade-campus grade-campus--${record.campus.startsWith("Male") ? "male" : "female"}`}>{record.campus}</span></td><td>{record.instructor}</td><td>{record.totalStudents}</td><td><span className="grade-signal grade-signal--easy">{highGrades(record)} of {record.totalStudents} ({percent(highGrades(record), record).toFixed(1)}%)</span></td></tr>)}</tbody></table></div>
      </section>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--difficult">
        <div className="grade-report-section-heading"><span>03</span><div><h2>Sections with Highest Withdrawal Rates</h2><p>Top {sectionRankingCount} sections ranked by withdrawal percentage.</p></div><b>{highestWithdrawalSections.length} sections</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Rank</th><th>Course / Section</th><th>Course Name</th><th>Campus</th><th>Instructor</th><th>Students</th><th>Withdrawal Outcome</th></tr></thead><tbody>{highestWithdrawalSections.map((record, index) => <tr key={`withdrawal-section-${cohortKey(record)}`}><td><strong>#{index + 1}</strong></td><td><strong>{record.course} · Section {record.section}</strong></td><td>{record.title}</td><td><span className={`grade-campus grade-campus--${record.campus.startsWith("Male") ? "male" : "female"}`}>{record.campus}</span></td><td>{record.instructor}</td><td>{record.totalStudents}</td><td><span className="grade-signal grade-signal--difficult">{record.grades.W} of {record.totalStudents} ({percent(record.grades.W, record).toFixed(1)}%)</span></td></tr>)}</tbody></table></div>
      </section>
      <section className="grade-panel grade-report grade-detailed-summary">
        <div className="grade-report-section-heading"><span>04</span><div><h2>Section Grade Variation Analysis</h2><p>{variationMeasureFilter === "All Grade Measures" ? "All individual grades plus Combined A/A+ and D+ & Below" : variationMeasureFilter} · highest-to-lowest differences of {variationThreshold} percentage points or more.</p></div><b>{notableSectionDifferences.length} findings</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course</th><th>Course Name</th><th>Grade Measure</th><th>Highest Section</th><th>Lowest Section</th><th>Difference</th></tr></thead><tbody>{notableSectionDifferences.map((item) => <tr key={`${item.course}-${item.measure}`}><td><strong>{item.course}</strong></td><td>{item.title}</td><td><strong>{item.measure}</strong></td><td>Section {item.highest.record.section} · {item.highest.record.campus} · {item.highest.record.totalStudents} students · {item.highest.rate.toFixed(1)}%</td><td>Section {item.lowest.record.section} · {item.lowest.record.campus} · {item.lowest.record.totalStudents} students · {item.lowest.rate.toFixed(1)}%</td><td><span className="grade-gap">{item.difference.toFixed(1)} pp</span></td></tr>)}</tbody></table></div>
        {!notableSectionDifferences.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No notable section variations</strong>No grade measure differs by {variationThreshold} percentage points or more.</span></div>}
      </section>
      <section className="grade-panel grade-report grade-detailed-summary grade-signal-section--difficult">
        <div className="grade-report-section-heading"><span>05</span><div><h2>Sections Requiring Academic Review</h2><p>Sections meeting the low-grade threshold, withdrawal rule, or notable variation review criteria.</p></div><b>{reviewSections.length} sections</b></div>
        <div className="grade-table-scroll"><table><thead><tr><th>Course / Section</th><th>Course Name</th><th>Campus</th><th>Instructor</th><th>Students</th><th>D+ &amp; Below</th><th>Withdrawal</th></tr></thead><tbody>{reviewSections.map((record) => <tr key={`review-${cohortKey(record)}`}><td><strong>{record.course} · Section {record.section}</strong></td><td>{record.title}</td><td><span className={`grade-campus grade-campus--${record.campus.startsWith("Male") ? "male" : "female"}`}>{record.campus}</span></td><td>{record.instructor}</td><td>{record.totalStudents}</td><td><span className="grade-signal grade-signal--difficult">{percent(record.grades["D+"] + record.grades["D&Below"], record).toFixed(1)}%</span></td><td>{percent(record.grades.W, record).toFixed(1)}%</td></tr>)}</tbody></table></div>
        {!reviewSections.length && <div className="grade-review-empty"><MiniIcon name="check" /><span><strong>No sections require review</strong>No section meets the current academic-review rules.</span></div>}
      </section>
      </>}
      </>}
      </>}
    </div>
  );
}
