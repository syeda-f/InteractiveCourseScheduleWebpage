import * as XLSX from "xlsx";
import { prerequisitePairs } from "./prerequisiteData";
import { ccesCourseCatalog } from "./courseCatalogData";

export type Campus = "Female" | "Male";
export type ConflictType = "room" | "instructor" | "course" | "capacity" | "prerequisite";

export type ScheduleCourse = {
  id: string;
  code: string;
  section: string;
  name: string;
  college: "CCES" | "COBA" | "COE" | "COAD" | "CSHS" | "COL";
  instructor: string;
  room: string;
  roomType: "Lecture" | "Lab";
  gender: Campus;
  days: string[];
  startMinute: number;
  endMinute: number;
  maxEnrollment: number;
  enrolled: number;
  available: number;
  status: "Open" | "Closed";
  session: string;
  conflicts: ConflictType[];
  conflictDetails?: string[];
};

export type CrossListedGroup = {
  key: string;
  campus: Campus;
  courses: ScheduleCourse[];
};

const COLUMNS = [
  "TERM CODE", "CRN", "CAMP CODE", "COURSE CODE", "SEQUENCE NUMBER",
  "COURSE Title", "MAX_ENRL", "ENRL", "AVAIL", "SESSION_CODE", "ATIMING",
  "SAT", "SUN", "MON", "TUE", "WED", "THU", "ROOM", "Instructor",
  "weekly_contact_hr",
];

const DAY_COLUMNS = [
  ["Sunday", "SUN"],
  ["Monday", "MON"],
  ["Tuesday", "TUE"],
  ["Wednesday", "WED"],
  ["Thursday", "THU"],
] as const;

const collegeGroups = {
  CCES: new Set(["ASSE", "CSEC", "COSC", "GEIT", "ITAP", "SOEN", "COEN", "AINT"]),
  COBA: new Set(["ACCT", "BUSI", "ECON", "FINA", "HRMT", "MISY", "MKDM"]),
  COE: new Set(["GEEN", "MEEN", "EEEN", "CHEN", "CVEN", "PHYS", "CHEM"]),
  COAD: new Set(["ARCH", "COAD", "GDES", "IDES", "FURS", "SUST"]),
  CSHS: new Set(["BIOL", "PSYC", "PHED","SYST"]),
};

function getCollege(department: string): ScheduleCourse["college"] {
  if (collegeGroups.CCES.has(department)) return "CCES";
  if (collegeGroups.COBA.has(department)) return "COBA";
  if (collegeGroups.COE.has(department)) return "COE";
  if (collegeGroups.COAD.has(department)) return "COAD";
  if (collegeGroups.CSHS.has(department)) return "CSHS";
  if (department.startsWith("LAW")) return "COL";
  return "CSHS";
}

function getAsseCollege(title: string): ScheduleCourse["college"] {
  if (/\bCOBA\b/i.test(title)) return "COBA";
  if (/\bLAW\b/i.test(title)) return "COL";
  return "CCES";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanIdentifier(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : String(value ?? "").trim();
}

function parseTime(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4}) - (\d{4})$/);
  if (!match) return null;
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(2));
  return [toMinutes(match[1]), toMinutes(match[2])] as const;
}

export function normalizeCourseTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\blab(oratory)?\b/g, "")
    .replace(/\barch\b/g, "architecture")
    .replace(/\bdiff\b/g, "differential")
    .replace(/\beng'?g\b/g, "engineering")
    .replace(/\bassu\b/g, "assurance")
    .replace(/\basse\b/g, "assessment")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const catalogTitlesByCode = new Map<string, string[]>();
ccesCourseCatalog.forEach((item) => {
  catalogTitlesByCode.set(item.code, [...(catalogTitlesByCode.get(item.code) ?? []), item.title]);
});

export function canonicalCourseTitle(code: string, title: string) {
  const options = catalogTitlesByCode.get(code);
  if (!options?.length) return title;
  if (options.length === 1) return options[0];
  const normalized = normalizeCourseTitle(title);
  return options.find((option) => {
    const candidate = normalizeCourseTitle(option);
    return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
  }) ?? title;
}

const normalizedPrerequisites = prerequisitePairs.map((pair) => ({
  course: normalizeCourseTitle(pair.course),
  prerequisite: normalizeCourseTitle(pair.prerequisite),
}));

function isPrerequisitePair(first: ScheduleCourse, second: ScheduleCourse) {
  if (first.college !== "CCES" || second.college !== "CCES") return false;
  const firstTitle = normalizeCourseTitle(first.name);
  const secondTitle = normalizeCourseTitle(second.name);
  return normalizedPrerequisites.some((pair) =>
    (pair.course === firstTitle && pair.prerequisite === secondTitle) ||
    (pair.course === secondTitle && pair.prerequisite === firstTitle)
  );
}

function roomCapacityMap(courses: ScheduleCourse[]) {
  const capacities = new Map<string, number>();
  courses.forEach((course) => {
    if (course.room === "-") return;
    const key = `${course.gender}|${course.room}`;
    capacities.set(key, Math.max(capacities.get(key) ?? 0, course.maxEnrollment));
  });
  return capacities;
}

function hasAssignedInstructor(course: ScheduleCourse) {
  return !["", "Unassigned", "NAME NOT FOUND FOR PIDM:"].includes(course.instructor);
}

function hasPhysicalRoom(course: ScheduleCourse) {
  return course.room !== "-" && !/\bONLINE\b/i.test(course.room);
}

export function inferRoomCapacity(courses: ScheduleCourse[], course: ScheduleCourse) {
  return roomCapacityMap(courses).get(`${course.gender}|${course.room}`) ?? course.maxEnrollment;
}

export async function parseScheduleFile(file: File): Promise<ScheduleCourse[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) => row.some((value) => String(value).trim() === "COURSE CODE"));
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const headers = headerIndex >= 0 ? rows[headerIndex].map(String) : COLUMNS;

  const courses = dataRows.flatMap((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const code = String(record["COURSE CODE"] ?? "").trim();
    const timing = parseTime(record.ATIMING);
    if (!code || !timing) return [];

    const days = DAY_COLUMNS.filter(([, key]) => Boolean(record[key])).map(([day]) => day);
    if (!days.length) return [];

    const campusCode = String(record["CAMP CODE"] ?? "");
    const sourceName = String(record["COURSE Title"] ?? "").trim();
    const name = canonicalCourseTitle(code, sourceName);
    const available = numberValue(record.AVAIL);
    const department = code.split(" ")[0];

    return [{
      id: cleanIdentifier(record.CRN),
      code,
      section: cleanIdentifier(record["SEQUENCE NUMBER"]),
      name,
      college: department === "ASSE" ? getAsseCollege(name) : getCollege(department),
      instructor: String(record.Instructor || "Unassigned").trim(),
      room: String(record.ROOM || "-").trim(),
      roomType: /\b(lab|laboratory|studio|clinical|practicum|workshop)\b/i.test(name) ? "Lab" as const : "Lecture" as const,
      gender: campusCode.startsWith("F") ? "Female" as const : "Male" as const,
      days,
      startMinute: timing[0],
      endMinute: timing[1],
      maxEnrollment: numberValue(record.MAX_ENRL),
      enrolled: numberValue(record.ENRL),
      available,
      status: available > 0 ? "Open" as const : "Closed" as const,
      session: String(record.SESSION_CODE || "D"),
      conflicts: [] as ConflictType[],
      conflictDetails: [],
    }];
  });

  if (!courses.length) {
    throw new Error("No scheduled course rows were found in this workbook.");
  }
  return courses;
}

export function recalculateConflicts(courses: ScheduleCourse[]) {
  const updated = courses.map((course) => ({
    ...course,
    name: canonicalCourseTitle(course.code, course.name),
    college: getCourseCollege(course),
    conflicts: [] as ConflictType[],
    conflictDetails: [] as string[],
  }));
  const meetings = new Map<string, Array<[number, ScheduleCourse]>>();

  updated.forEach((course, index) => {
    course.days.forEach((day) => {
      const key = `${course.gender}:${day}`;
      meetings.set(key, [...(meetings.get(key) ?? []), [index, course]]);
    });
  });

  meetings.forEach((entries) => {
    entries.sort(([, first], [, second]) => first.startMinute - second.startMinute);
    entries.forEach(([, first], position) => {
      for (const [, second] of entries.slice(position + 1)) {
        if (second.startMinute >= first.endMinute) break;
        if (second.endMinute <= first.startMinute) continue;
        const sameRecord = first.id === second.id && first.code === second.code && first.section === second.section;
        if (sameRecord) continue;
        const crossListed =
          first.code !== second.code &&
          hasPhysicalRoom(first) &&
          first.room === second.room &&
          hasAssignedInstructor(first) &&
          first.instructor === second.instructor &&
          first.startMinute === second.startMinute &&
          first.endMinute === second.endMinute &&
          first.days.length === second.days.length &&
          first.days.every((day) => second.days.includes(day));
        if (crossListed) continue;

        const reasons: ConflictType[] = [];
        if (hasAssignedInstructor(first) && first.instructor === second.instructor) reasons.push("instructor");
        if (hasPhysicalRoom(first) && first.room === second.room) reasons.push("room");
        if (isPrerequisitePair(first, second)) reasons.push("prerequisite");
        reasons.forEach((reason) => {
          if (!first.conflicts.includes(reason)) first.conflicts.push(reason);
          if (!second.conflicts.includes(reason)) second.conflicts.push(reason);
          const firstDetail = `${reason}: ${second.code} · Section ${second.section}`;
          const secondDetail = `${reason}: ${first.code} · Section ${first.section}`;
          if (!first.conflictDetails?.includes(firstDetail)) first.conflictDetails?.push(firstDetail);
          if (!second.conflictDetails?.includes(secondDetail)) second.conflictDetails?.push(secondDetail);
        });
      }
    });
  });

  const roomCapacities = roomCapacityMap(updated);
  updated.forEach((course) => {
    const roomCapacity = roomCapacities.get(`${course.gender}|${course.room}`) ?? course.maxEnrollment;
    if (course.enrolled > roomCapacity) {
      course.conflicts.push("capacity");
      course.conflictDetails?.push(`capacity: ${course.enrolled} enrolled / ${roomCapacity} inferred seats`);
    }
  });
  return updated;
}

function getCourseCollege(course: ScheduleCourse): ScheduleCourse["college"] {
  const department = course.code.split(" ")[0];
  return department === "ASSE" ? getAsseCollege(course.name) : getCollege(department);
}

const CROSS_LISTED_CODES_BY_TITLE: Record<string, string> = {
  algorithms: "COSC 3351",
  bioinformatics: "COSC 4376",
  cloudcomputing: "ITAP 4315",
  computergraphics: "COSC 4371",
  computernetworks: "COEN 3361",
  computervision: "AINT 4373",
  discretestructuresandcombinatorialanalysis: "COSC 3332",
  distributedsystemsinalgorithms: "COSC 4372",
  ecommerce: "SOEN 4371",
  formalmethodsinsoftwareengineering: "SOEN 3314",
  introductiontocryptography: "CSEC 3354",
  logicandformalverification: "COSC 3357",
  networkadministration: "ITAP 4362",
  networkmanagement: "ITAP 2431",
  networkmanagementlab: "ITAP 2431",
  networksecurity: "CSEC 3431",
  networksecuritylab: "CSEC 3431",
  operatingsystems: "COSC 4361",
  parallelcomputing: "COSC 4365",
  programminglanguages: "COSC 4461",
  programminglanguageslab: "COSC 4461",
  quantuminformationandcomputation: "COSC 4380",
  secureecommerce: "ITAP 4376",
  softwareprojectmanagement: "SOEN 4313",
  softwaretestingandqualityassurance: "SOEN 4312",
  specialtopicsimachinelearn: "COSC 4393",
  systemsprogramming: "ITAP 3411",
  systemsprogramminglab: "ITAP 3411",
  webprogramming: "SOEN 2312",
  webprogramminglab: "SOEN 2312",
};

export function mergeCrossListedCourses(courses: ScheduleCourse[]) {
  const grouped = new Map<string, ScheduleCourse[]>();
  courses.forEach((course) => {
    const key = [
      course.gender,
      course.section,
      normalizeCourseTitle(course.name),
      [...course.days].sort().join(","),
      course.startMinute,
      course.endMinute,
      course.room,
      course.instructor,
    ].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), course]);
  });
  return [...grouped.values()].map((records) => {
    if (records.length === 1) return records[0];
    const first = records[0];
    const normalizedTitle = normalizeCourseTitle(first.name);
    return {
      ...first,
      id: records.map((record) => record.id).join(" / "),
      code: CROSS_LISTED_CODES_BY_TITLE[normalizedTitle] ?? first.code,
      maxEnrollment: records.reduce((sum, record) => sum + record.maxEnrollment, 0),
      enrolled: records.reduce((sum, record) => sum + record.enrolled, 0),
      available: records.reduce((sum, record) => sum + record.available, 0),
      status: records.some((record) => record.status === "Open") ? "Open" as const : "Closed" as const,
      conflicts: [...new Set(records.flatMap((record) => record.conflicts))],
      conflictDetails: [...new Set(records.flatMap((record) => record.conflictDetails ?? []))],
    };
  });
}

export function findCrossListedGroups(courses: ScheduleCourse[]): CrossListedGroup[] {
  const grouped = new Map<string, ScheduleCourse[]>();
  courses.forEach((course) => {
    if (!hasPhysicalRoom(course) || !hasAssignedInstructor(course)) return;
    const key = [
      course.gender,
      [...course.days].sort().join(","),
      course.startMinute,
      course.endMinute,
      course.room,
      course.instructor,
    ].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), course]);
  });

  return [...grouped.entries()]
    .filter(([, records]) => new Set(records.map((course) => course.code)).size > 1)
    .map(([key, records]) => ({ key, campus: records[0].gender, courses: records }))
    .sort((a, b) => a.courses[0].code.localeCompare(b.courses[0].code));
}
