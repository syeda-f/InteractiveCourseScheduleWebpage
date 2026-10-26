import * as XLSX from "xlsx";
import { prerequisitePairs } from "./prerequisiteData";

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

function normalizeCourseTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\blab(oratory)?\b/g, "")
    .replace(/\barch\b/g, "architecture")
    .replace(/\bdiff\b/g, "differential")
    .replace(/\beng'?g\b/g, "engineering")
    .replace(/\bassu\b/g, "assurance")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
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
    const name = String(record["COURSE Title"] ?? "").trim();
    const available = numberValue(record.AVAIL);
    const department = code.split(" ")[0];

    return [{
      id: cleanIdentifier(record.CRN),
      code,
      section: cleanIdentifier(record["SEQUENCE NUMBER"]),
      name,
      college: getCollege(department),
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
    }];
  });

  if (!courses.length) {
    throw new Error("No scheduled course rows were found in this workbook.");
  }
  return courses;
}

export function recalculateConflicts(courses: ScheduleCourse[]) {
  const updated = courses.map((course) => ({ ...course, conflicts: [] as ConflictType[] }));
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
          first.room !== "-" &&
          first.room === second.room &&
          first.instructor !== "NAME NOT FOUND FOR PIDM:" &&
          first.instructor === second.instructor &&
          first.startMinute === second.startMinute &&
          first.endMinute === second.endMinute &&
          first.days.length === second.days.length &&
          first.days.every((day) => second.days.includes(day));
        if (crossListed) continue;

        const reasons: ConflictType[] = [];
        if (first.code === second.code && first.section !== second.section) reasons.push("course");
        if (first.instructor !== "NAME NOT FOUND FOR PIDM:" && first.instructor === second.instructor) reasons.push("instructor");
        if (first.room !== "-" && first.room === second.room) reasons.push("room");
        if (isPrerequisitePair(first, second)) reasons.push("prerequisite");
        reasons.forEach((reason) => {
          if (!first.conflicts.includes(reason)) first.conflicts.push(reason);
          if (!second.conflicts.includes(reason)) second.conflicts.push(reason);
        });
      }
    });
  });

  const roomCapacities = roomCapacityMap(updated);
  updated.forEach((course) => {
    const roomCapacity = roomCapacities.get(`${course.gender}|${course.room}`) ?? course.maxEnrollment;
    if (course.enrolled > roomCapacity) course.conflicts.push("capacity");
  });
  return updated;
}

export function findCrossListedGroups(courses: ScheduleCourse[]): CrossListedGroup[] {
  const grouped = new Map<string, ScheduleCourse[]>();
  courses.forEach((course) => {
    if (course.room === "-" || course.instructor === "NAME NOT FOUND FOR PIDM:") return;
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
