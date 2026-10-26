import initialExamData from "./examData.json";

export type College = "CCES" | "COBA" | "COE" | "COAD" | "CSHS" | "COL";

export interface ExamConflict {
  type: "room_overlap" | "proctor_overlap" | "max_proctor_day" | "insufficient_proctors" | "campus_gender_violation" | "student_daily_limit";
  label: string;
  detail: string;
  severity: "critical" | "warning";
}

export interface Exam {
  id: string;
  crn: string;
  code: string;
  name: string;
  department: string;
  college: College;
  section: string;
  numStudents: number;
  instructor: string;
  building: string;
  room: string;
  day: string;
  date: string;
  hour: string;
  gender: "Female" | "Male";
  proctor1: string;
  proctor2: string;
  semester: string;
  conflicts: ExamConflict[];
}

export const EXAM_HOURS = ["9:00AM", "12:00PM", "3:00PM", "6:00PM"] as const;
export const EXAM_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"] as const;
export const EXAM_SEMESTERS = ["Spring 2026", "Fall 2025", "Spring 2025"] as const;

const FEMALE_NAMES = new Set([
  "nivine", "irum", "budoor", "wesal", "sara", "bdoor", "zeenat", "maytha", "huda", "amirah",
  "pia", "betty", "virginia", "malikah", "karen", "bettina", "deborah", "norah", "fida", "ruqia",
  "zehra", "dalal", "sumiya", "sireen", "samar", "duaa", "ghuna", "aseel", "shubashini", "tasneem",
  "antonia", "lamis", "soha", "asma", "siddiqua", "lila", "gaydaa", "halah", "yasmeen", "zulfat", "reema", "nadia"
]);

export function calculateExamConflicts(rawExams: Omit<Exam, "conflicts">[]): Exam[] {
  const conflictsMap = new Map<string, ExamConflict[]>();
  rawExams.forEach((e) => conflictsMap.set(e.id, []));

  // 1. Room overlap: same date, hour, and room hosting 2+ exams
  const roomMap = new Map<string, typeof rawExams>();
  rawExams.forEach((e) => {
    if (!e.room || e.room === "-") return;
    const key = `${e.date}__${e.hour}__${e.room.trim().toLowerCase()}`;
    if (!roomMap.has(key)) roomMap.set(key, []);
    roomMap.get(key)!.push(e);
  });
  roomMap.forEach((group) => {
    if (group.length > 1) {
      group.forEach((e) => {
        conflictsMap.get(e.id)!.push({
          type: "room_overlap",
          severity: "critical",
          label: "Room double-booking",
          detail: `Room ${e.room} booked for ${group.length} exams at ${e.hour} on ${e.day} (${group.map((g) => g.code).join(", ")})`,
        });
      });
    }
  });

  // 2. Instructor / Proctor assignment overlap at the same time
  const personTimeMap = new Map<string, { exam: (typeof rawExams)[0]; person: string; role: string }[]>();
  rawExams.forEach((e) => {
    const proctors = [e.proctor1, e.proctor2].filter(Boolean);
    proctors.forEach((p) => {
      const key = `${e.date}__${e.hour}__${p.trim().toLowerCase()}`;
      if (!personTimeMap.has(key)) personTimeMap.set(key, []);
      personTimeMap.get(key)!.push({ exam: e, person: p, role: "Proctor" });
    });
    if (e.instructor) {
      const key = `${e.date}__${e.hour}__${e.instructor.trim().toLowerCase()}`;
      if (!personTimeMap.has(key)) personTimeMap.set(key, []);
      personTimeMap.get(key)!.push({ exam: e, person: e.instructor, role: "Instructor" });
    }
  });

  personTimeMap.forEach((entries) => {
    const uniqueExams = Array.from(new Set(entries.map((en) => en.exam.id)));
    if (uniqueExams.length > 1) {
      entries.forEach((en) => {
        const list = conflictsMap.get(en.exam.id)!;
        if (!list.some((c) => c.type === "proctor_overlap" && c.detail.includes(en.person))) {
          list.push({
            type: "proctor_overlap",
            severity: "critical",
            label: "Proctor/Faculty time clash",
            detail: `${en.person} assigned concurrently to multiple exams at ${en.exam.hour} on ${en.exam.day}`,
          });
        }
      });
    }
  });

  // 3. Proctor max 2 exams per day
  const personDayMap = new Map<string, { exam: (typeof rawExams)[0]; person: string }[]>();
  rawExams.forEach((e) => {
    const proctors = [e.proctor1, e.proctor2].filter(Boolean);
    proctors.forEach((p) => {
      const key = `${e.date}__${p.trim().toLowerCase()}`;
      if (!personDayMap.has(key)) personDayMap.set(key, []);
      personDayMap.get(key)!.push({ exam: e, person: p });
    });
  });

  personDayMap.forEach((entries) => {
    if (entries.length > 2) {
      entries.forEach((en) => {
        const list = conflictsMap.get(en.exam.id)!;
        if (!list.some((c) => c.type === "max_proctor_day" && c.detail.includes(en.person))) {
          list.push({
            type: "max_proctor_day",
            severity: "warning",
            label: "Proctor daily quota exceeded",
            detail: `${en.person} assigned to ${entries.length} exams on ${en.exam.day} (limit is 2 exams/day)`,
          });
        }
      });
    }
  });

  // 4. Exams with > 20 students need at least two proctors
  rawExams.forEach((e) => {
    const proctorCount = [e.proctor1, e.proctor2].filter(Boolean).length;
    if (e.numStudents > 20 && proctorCount < 2) {
      conflictsMap.get(e.id)!.push({
        type: "insufficient_proctors",
        severity: "warning",
        label: "Requires 2nd proctor (>20 students)",
        detail: `Section has ${e.numStudents} students registered but only ${proctorCount} proctor assigned (minimum 2 required)`,
      });
    }
  });

  // 5. Female instructors can only proctor exams on the female campus
  rawExams.forEach((e) => {
    if (e.gender === "Male") {
      const p1 = (e.proctor1 || "").toLowerCase().split(" ")[0];
      const p2 = (e.proctor2 || "").toLowerCase().split(" ")[0];
      if (FEMALE_NAMES.has(p1) || FEMALE_NAMES.has(p2)) {
        const femaleFaculty = FEMALE_NAMES.has(p1) ? e.proctor1 : e.proctor2;
        conflictsMap.get(e.id)!.push({
          type: "campus_gender_violation",
          severity: "critical",
          label: "Female proctor on male campus",
          detail: `Female instructor/proctor (${femaleFaculty}) assigned to Male campus exam`,
        });
      }
    }
  });

  // 6. Student overload: More than 2 exams on the same day for same course level & cohort
  const cohortDayMap = new Map<string, (typeof rawExams)[0][]>();
  rawExams.forEach((e) => {
    const levelMatch = e.code.match(/\d/);
    const level = levelMatch ? levelMatch[0] : "1";
    const key = `${e.date}__${e.gender}__${e.department}__${level}`;
    if (!cohortDayMap.has(key)) cohortDayMap.set(key, []);
    cohortDayMap.get(key)!.push(e);
  });
  cohortDayMap.forEach((cohortExams) => {
    if (cohortExams.length > 2) {
      cohortExams.forEach((e) => {
        conflictsMap.get(e.id)!.push({
          type: "student_daily_limit",
          severity: "warning",
          label: "Cohort exam overload (>2 exams/day)",
          detail: `${e.department} level-${e.code.match(/\d/)?.[0] || "1"} students have ${cohortExams.length} exams scheduled on ${e.day}`,
        });
      });
    }
  });

  return rawExams.map((e) => ({
    ...e,
    conflicts: conflictsMap.get(e.id) || [],
  }));
}

export const initialExams: Exam[] = calculateExamConflicts(initialExamData as Omit<Exam, "conflicts">[]);
