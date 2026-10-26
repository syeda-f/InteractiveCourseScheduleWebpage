import { useEffect, useMemo, useRef, useState } from "react";
import GradeAnalysis from "./GradeAnalysis";
import { collegeProfessors } from "./collegeProfessors";
import { CCES_MAJORS, ccesCourseCatalog, collegeCodeRules, type CcesMajor } from "./courseCatalogData";
import { scheduleCourses } from "./scheduleData";
import { findCrossListedGroups, inferRoomCapacity, parseScheduleFile, recalculateConflicts, type Campus, type ScheduleCourse } from "./scheduleImport";
import {
  initialExams,
  type Exam,
  type ExamConflict,
  EXAM_HOURS,
  EXAM_DAYS,
  EXAM_SEMESTERS,
  calculateExamConflicts,
} from "./examData";

type College = "CCES" | "COBA" | "COE" | "COAD" | "CSHS" | "COL";
type Course = ScheduleCourse;
type ActiveView = "courses" | "grades" | "exams";
type SectionRecommendation = {
  course: Course;
  campus: Campus;
  instructor: string;
  room: string;
  roomCapacity: number;
  day: string;
  startMinute: number;
  endMinute: number;
  score: number;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const initialCourses = scheduleCourses as unknown as ScheduleCourse[];
const TIMES = Array.from({ length: 16 }, (_, index) => {
  const hour = index + 8;
  const displayHour = hour > 12 ? hour - 12 : hour;
  const period = hour < 12 ? "AM" : "PM";
  return `${displayHour}:00 – ${displayHour}:59 ${period}`;
});

const collegeNames: Record<College, string> = {
  CCES: "Computing",
  COBA: "Business",
  COE: "Engineering",
  COAD: "Architecture",
  CSHS: "Health Sciences & Core",
  COL: "Law",
};

const DAY_LABELS: Record<string, string> = {
  Sunday: "U",
  Monday: "M",
  Tuesday: "T",
  Wednesday: "W",
  Thursday: "R",
};

function getCourseParts(code: string) {
  const match = code.trim().match(/^(\S+)\s+(\d+)/);
  return { prefix: match?.[1] ?? "", numeric: match?.[2] ?? "" };
}

function courseBelongsToCollege(code: string, college: string) {
  const { prefix, numeric } = getCourseParts(code);
  return (
    collegeCodeRules.some(
      (rule) =>
        rule.college === college &&
        rule.prefix === prefix &&
        (rule.numeric === null || rule.numeric === numeric)
    ) ||
    (college === "CCES" && ccesCourseCatalog.some((item) => item.code === code))
  );
}

function keepValidSelections(current: string[], options: readonly string[]) {
  const next = current.filter((item) => options.includes(item));
  return next.length === current.length && next.every((item, index) => item === current[index])
    ? current
    : next;
}

function formatMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

function getCourseLevel(code: string) {
  const firstDigit = Number(code.match(/\d/)?.[0]);
  return firstDigit === 0 ? "Prep" : ["Freshman", "Sophomore", "Junior", "Senior"][firstDigit - 1] ?? "";
}

function Icon({
  name,
  size = 18,
}: {
  name:
    | "upload"
    | "plus"
    | "search"
    | "chevron"
    | "warning"
    | "warningTriangle"
    | "calendar"
    | "close"
    | "spark"
    | "sun"
    | "moon"
    | "fileText"
    | "userCheck"
    | "chart";
  size?: number;
}) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
        <path d="M4 15v4h16v-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    warning: (
      <>
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
    warningTriangle: (
      <>
        <path
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          fill="#fef08a"
          stroke="#dc2626"
          strokeWidth="2"
        />
        <line x1="12" y1="9" x2="12" y2="13" stroke="#991b1b" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.1" fill="#991b1b" stroke="none" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    spark: (
      <>
        <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
        <path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>
    ),
    moon: <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />,
    fileText: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </>
    ),
    userCheck: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <polyline points="17 11 19 13 23 9" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
      </>
    ),
  };
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Button({
  children,
  variant = "primary",
  onClick,
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button className={`button button--${variant} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="select-control">
      <span>{label}</span>
      <span className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <Icon name="chevron" size={15} />
      </span>
    </label>
  );
}

const FILTER_OPEN_EVENT = "schedule-filter-open";

function useExclusiveFilterMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(Symbol("filter-menu"));

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<symbol>).detail !== menuId.current) setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener(FILTER_OPEN_EVENT, closeWhenAnotherOpens);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener(FILTER_OPEN_EVENT, closeWhenAnotherOpens);
    };
  }, []);

  const toggleOpen = () => {
    const nextOpen = !open;
    if (nextOpen) {
      document.dispatchEvent(new CustomEvent(FILTER_OPEN_EVENT, { detail: menuId.current }));
    }
    setOpen(nextOpen);
  };

  return { open, setOpen, toggleOpen, containerRef };
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const { open, setOpen, toggleOpen, containerRef } = useExclusiveFilterMenu();
  const [query, setQuery] = useState("");
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="select-control filter-select" ref={containerRef}>
      <span>{label}</span>
      <button
        type="button"
        className="multi-select__trigger"
        aria-expanded={open}
        onClick={() => {
          toggleOpen();
          setQuery("");
        }}
      >
        <span>{value}</span>
        <Icon name="chevron" size={15} />
      </button>
      {open && (
        <div className="multi-select__menu filter-select__menu">
          <label className="filter-option-search">
            <Icon name="search" size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
            />
          </label>
          <div className="filter-select__options">
            {filteredOptions.map((option) => (
              <button
                type="button"
                className={option === value ? "filter-select__option filter-select__option--active" : "filter-select__option"}
                key={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{option}</span>
                {option === value && <span aria-hidden="true">✓</span>}
              </button>
            ))}
            {filteredOptions.length === 0 && <span className="filter-select__empty">No matching options</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function MultiSelect({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  const { open, toggleOpen, containerRef } = useExclusiveFilterMenu();
  const [query, setQuery] = useState("");
  const toggleValue = (option: string) => {
    onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  };
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="select-control multi-select" ref={containerRef}>
      <span>{label}</span>
      <button
        type="button"
        className="multi-select__trigger"
        onClick={() => {
          toggleOpen();
          setQuery("");
        }}
      >
        <span>{values.length ? `${values.length} slots selected` : "All time slots"}</span>
        <Icon name="chevron" size={15} />
      </button>
      {open && (
        <div className="multi-select__menu">
          <div className="multi-select__head">
            <strong>Select time slots</strong>
            <button onClick={() => onChange([])}>Clear</button>
          </div>
          <label className="filter-option-search">
            <Icon name="search" size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search time slots…"
            />
          </label>
          {filteredOptions.map((option) => (
            <label key={option}>
              <input type="checkbox" checked={values.includes(option)} onChange={() => toggleValue(option)} />
              <span>{option}</span>
            </label>
          ))}
          {filteredOptions.length === 0 && <span className="filter-select__empty">No matching options</span>}
        </div>
      )}
    </div>
  );
}

function SearchableMultiFilter({
  label,
  values,
  options,
  emptyLabel,
  colorSelections = false,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  emptyLabel: string;
  colorSelections?: boolean;
  onChange: (values: string[]) => void;
}) {
  const { open, toggleOpen, containerRef } = useExclusiveFilterMenu();
  const [query, setQuery] = useState("");
  const orderedOptions = [
    ...values.filter((value) => options.includes(value)),
    ...options.filter((option) => !values.includes(option)),
  ];
  const filteredOptions = orderedOptions.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase())
  );
  const toggleValue = (option: string) => {
    onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  };

  return (
    <div className="select-control multi-select" ref={containerRef}>
      <span>{label}</span>
      <button
        type="button"
        className="multi-select__trigger"
        aria-expanded={open}
        onClick={() => {
          toggleOpen();
          setQuery("");
        }}
      >
        <span>{values.length ? `${values.length} selected` : emptyLabel}</span>
        <Icon name="chevron" size={15} />
      </button>
      {values.length > 0 && (
        <div className="selected-filter-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {values.map((value) => (
            <span
              className={`selected-filter-chip ${colorSelections ? `instructor-track-${values.indexOf(value) % 12}` : ""}`}
              key={value}
            >
              <span title={value}>{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((selected) => selected !== value))}
              >
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="multi-select__menu">
          <div className="multi-select__head">
            <strong>Select {label.toLowerCase()}</strong>
            <button type="button" onClick={() => onChange([])}>Clear</button>
          </div>
          <label className="filter-option-search">
            <Icon name="search" size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
            />
          </label>
          {filteredOptions.map((option) => (
            <label key={option}>
              <input type="checkbox" checked={values.includes(option)} onChange={() => toggleValue(option)} />
              {colorSelections && values.includes(option) && (
                <i className={`instructor-color-dot instructor-track-${values.indexOf(option) % 12}`} />
              )}
              <span>{option}</span>
            </label>
          ))}
          {filteredOptions.length === 0 && <span className="filter-select__empty">No matching options</span>}
        </div>
      )}
    </div>
  );
}

function CheckboxFilter({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="checkbox-filter">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() =>
                onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option])
              }
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FileImport({
  label,
  campus,
  onImport,
}: {
  label: string;
  campus: Campus;
  onImport: (file: File, campus: Campus) => Promise<number>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState(`${campus} campus · .xlsx`);
  const handleFile = async (selectedFile?: File) => {
    if (!selectedFile) return;
    setStatus("loading");
    setMessage("Reading workbook…");
    try {
      const count = await onImport(selectedFile, campus);
      setFile(selectedFile.name);
      setMessage(`${count} scheduled sections loaded`);
      setStatus("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import workbook");
      setStatus("error");
    }
  };
  return (
    <div className={`import-item import-item--${status}`}>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".xlsx,.xls"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <button className="import-button" onClick={() => inputRef.current?.click()}>
        <span className="import-icon">
          <Icon name="upload" size={17} />
        </span>
        <span>
          <strong>{status === "loading" ? "Importing…" : file || label}</strong>
          <small>{message}</small>
        </span>
      </button>
    </div>
  );
}

function StatCard({ value, label, detail, tone }: { value: string; label: string; detail: string; tone?: string }) {
  return (
    <div className={`stat-card ${tone ? `stat-card--${tone}` : ""}`}>
      <div className="stat-card__top">
        <span className="stat-value">{value}</span>
        <span className="stat-detail">{detail}</span>
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function CourseCard({
  course,
  showConflicts,
  instructorTrack,
  onSelect,
}: {
  course: Course;
  showConflicts: boolean;
  instructorTrack?: number;
  onSelect: (course: Course) => void;
}) {
  const conflictLabel = course.conflicts.length ? ` · Conflicts: ${course.conflicts.join(", ")}` : "";
  const [courseCode, courseNumber] = course.code.split(" ");
  const conflictNames = {
    room: "Room",
    instructor: "Instructor & time",
    course: "Course",
    capacity: "Capacity",
    prerequisite: "Prerequisite",
  };
  return (
    <button
      className={`course-card college-${course.college.toLowerCase()} ${
        instructorTrack !== undefined ? `instructor-track-${instructorTrack % 12}` : ""
      } ${showConflicts && course.conflicts.length ? "course-card--conflict" : ""}`}
      title={`${course.name} · Section ${course.section} · ${course.instructor} · ${course.room}${conflictLabel}`}
      onClick={() => onSelect(course)}
    >
      <span className="course-card__line">
        <strong>{courseCode}</strong>
        <span>{courseNumber}</span>
        <i>Sec {course.section}</i>
        {showConflicts && course.conflicts.length > 0 && (
          <>
            <span className="conflict-type-label">
              {course.conflicts.map((conflict) => conflictNames[conflict]).join(" · ")}
            </span>
            <span className="conflict-badge" title={`Conflict: ${course.conflicts.join(", ")}`}>
              <Icon name="warningTriangle" size={14} />
            </span>
          </>
        )}
      </span>
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveView>("courses");
  const [courses, setCourses] = useState<ScheduleCourse[]>(() => recalculateConflicts(initialCourses));
  const [exams, setExams] = useState<Exam[]>(initialExams);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const savedTheme = window.localStorage.getItem("schedule-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // Course schedule filters
  const [colleges, setColleges] = useState<string[]>([]);
  const [campusTab, setCampusTab] = useState<"All" | "Female" | "Male">("All");
  const [types, setTypes] = useState<string[]>(["Lecture", "Lab"]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(["Open", "Closed"]);
  const [instructors, setInstructors] = useState<string[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [courseNames, setCourseNames] = useState<string[]>([]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [numericCodes, setNumericCodes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showConflicts, setShowConflicts] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [showCourseConfig, setShowCourseConfig] = useState(false);
  const [configuredCourses, setConfiguredCourses] = useState<string[]>(() =>
    Array.from(new Set(ccesCourseCatalog.map((item) => item.code)))
  );
  const [configCategories, setConfigCategories] = useState({ MATH: true, GEIT: true, Electives: true });
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showConflictReport, setShowConflictReport] = useState(false);
  const [conflictReportSnapshot, setConflictReportSnapshot] = useState<ScheduleCourse[] | null>(null);
  const [recommendCollege, setRecommendCollege] = useState<string>("All colleges");
  const [recommendDepartmentsSelected, setRecommendDepartmentsSelected] = useState<string[]>([]);
  const [recommendCourse, setRecommendCourse] = useState<string>("Select a course");
  const [recommendInstructor, setRecommendInstructor] = useState<string>("All instructors");
  const [recommendCampus, setRecommendCampus] = useState<"All campuses" | Campus>("All campuses");
  const [recommendType, setRecommendType] = useState<"Lecture" | "Lab">("Lecture");
  const [selectedRecommendation, setSelectedRecommendation] = useState(0);
  const [visibleDays, setVisibleDays] = useState<string[]>(DAYS);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Exam schedule filters
  const [examSemester, setExamSemester] = useState<string>("Spring 2026");
  const [examCollege, setExamCollege] = useState<string>("All colleges");
  const [examDepartmentsSelected, setExamDepartmentsSelected] = useState<string[]>([]);
  const [examLevel, setExamLevel] = useState<string>("All levels");
  const [examGender, setExamGender] = useState<"All" | "Female" | "Male">("All");
  const [examInstructorsSelected, setExamInstructorsSelected] = useState<string[]>([]);
  const [examHour, setExamHour] = useState<string>("All hours");
  const [examRoom, setExamRoom] = useState<string>("All rooms");
  const [examSearch, setExamSearch] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [examHighlightConflicts, setExamHighlightConflicts] = useState(true);
  const [selectedExamDay, setSelectedExamDay] = useState<string>("All days");
  const [visibleExamDays, setVisibleExamDays] = useState<string[]>([...EXAM_DAYS]);
  const [showExamColumnPicker, setShowExamColumnPicker] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("schedule-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const currentMeta = useMemo(
    () => ({
      totalSections: courses.length,
      femaleSections: courses.filter((course) => course.gender === "Female").length,
      maleSections: courses.filter((course) => course.gender === "Male").length,
      openSections: courses.filter((course) => course.status === "Open").length,
      closedSections: courses.filter((course) => course.status === "Closed").length,
      conflictSections: courses.filter((course) => course.conflicts.length > 0).length,
      rooms: new Set(courses.filter((course) => course.room !== "-").map((course) => course.room)).size,
      enrollment: courses.reduce((total, course) => total + course.enrolled, 0),
      capacityIssues: courses.filter((course) => course.conflicts.includes("capacity")).length,
    }),
    [courses]
  );
  const examMeta = useMemo(() => {
    const total = exams.length;
    const withConflicts = exams.filter((e) => e.conflicts.length > 0).length;
    const femaleCount = exams.filter((e) => e.gender === "Female").length;
    const maleCount = exams.filter((e) => e.gender === "Male").length;
    const uniqueRooms = new Set(exams.map((e) => e.room)).size;
    const totalStudents = exams.reduce((acc, e) => acc + (e.numStudents || 0), 0);
    return { total, withConflicts, femaleCount, maleCount, uniqueRooms, totalStudents };
  }, [exams]);

  const handleImport = async (file: File, campus: Campus) => {
    const imported = await parseScheduleFile(file);
    const matchingCampus = imported.filter((course) => course.gender === campus);
    if (!matchingCampus.length) {
      throw new Error(`This workbook does not contain ${campus} campus sections.`);
    }
    setCourses((current) =>
      recalculateConflicts([
        ...current.filter((course) => course.gender !== campus),
        ...matchingCampus,
      ])
    );
    setCampusTab(campus);
    return matchingCampus.length;
  };

  const filteredCourses = useMemo(
    () =>
      courses.filter((course) => {
        const query = search.trim().toLowerCase();
        const { prefix, numeric } = getCourseParts(course.code);
        const ccesRows = ccesCourseCatalog.filter((item) => item.code === course.code);
        const selectedMajors = departments.filter((department): department is CcesMajor =>
          CCES_MAJORS.includes(department as CcesMajor)
        );
        const ccesSelected = colleges.includes("CCES") || selectedMajors.length > 0;
        const isMajorCourse =
          selectedMajors.length === 0 ||
          ccesRows.some((item) => selectedMajors.some((major) => item.majors.includes(major)));
        const isElective =
          selectedMajors.length > 0 &&
          !selectedMajors.includes(prefix as CcesMajor) &&
          prefix !== "MATH" &&
          prefix !== "GEIT";
        const passesConfiguration =
          !ccesSelected ||
          (configuredCourses.includes(course.code) &&
            (prefix !== "MATH" || configCategories.MATH) &&
            (prefix !== "GEIT" || configCategories.GEIT) &&
            (!isElective || configCategories.Electives));
        return (
          (colleges.length === 0 || colleges.some((college) => courseBelongsToCollege(course.code, college))) &&
          (!ccesSelected || ccesRows.length > 0) &&
          (campusTab === "All" || course.gender === campusTab) &&
          types.includes(course.roomType) &&
          (departments.length === 0 || (ccesSelected ? isMajorCourse : departments.includes(prefix))) &&
          (courseNames.length === 0 || courseNames.includes(course.name)) &&
          (prefixes.length === 0 || prefixes.includes(prefix)) &&
          (numericCodes.length === 0 || numericCodes.includes(numeric)) &&
          passesConfiguration &&
          (levels.length === 0 || levels.includes(getCourseLevel(course.code))) &&
          (statuses.length === 0 || statuses.includes(course.status)) &&
          (instructors.length === 0 || instructors.includes(course.instructor)) &&
          (rooms.length === 0 || rooms.includes(course.room)) &&
          (timeSlots.length === 0 ||
            timeSlots.some(
              (timeSlot) =>
                (TIMES.indexOf(timeSlot) + 8) * 60 < course.endMinute &&
                (TIMES.indexOf(timeSlot) + 9) * 60 > course.startMinute
            )) &&
          (!query || `${course.id} ${course.code} ${course.code.split(" ")[0]} ${course.name} ${course.instructor} ${course.room}`.toLowerCase().includes(query))
        );
      }),
    [campusTab, colleges, configuredCourses, configCategories, courseNames, departments, instructors, levels, numericCodes, prefixes, rooms, search, statuses, timeSlots, types, courses]
  );
  const reportScope = conflictReportSnapshot ?? [];
  const crossListedGroups = useMemo(() => findCrossListedGroups(reportScope), [reportScope]);
  const conflictReportRows = useMemo(() => [...reportScope]
    .filter((course) => course.conflicts.length > 0)
    .sort((a, b) => {
      const priority = (course: Course) =>
        course.conflicts.includes("course") ? 0 :
        course.conflicts.includes("instructor") ? 1 :
        course.conflicts.includes("room") ? 2 :
        course.conflicts.includes("capacity") ? 3 : 4;
      return priority(a) - priority(b) || a.code.localeCompare(b.code) || a.section.localeCompare(b.section);
    }), [reportScope]);
  const conflictCounts = useMemo(() => ({
    course: reportScope.filter((course) => course.conflicts.includes("course")).length,
    instructor: reportScope.filter((course) => course.conflicts.includes("instructor")).length,
    room: reportScope.filter((course) => course.conflicts.includes("room")).length,
    capacity: reportScope.filter((course) => course.conflicts.includes("capacity")).length,
    prerequisite: reportScope.filter((course) => course.conflicts.includes("prerequisite")).length,
  }), [reportScope]);
  const downloadConflictReport = () => {
    if (!conflictReportSnapshot) return;
    const escape = (value: string | number) => `"${String(value).replace(/"/g, "\"\"")}"`;
    const rows = [
      ["Report Scope", "All Course Schedule sections"],
      [],
      ["Status", "Priority", "Campus", "Course", "Section", "CRN", "Instructor", "Room", "Room Capacity", "Enrollment", "Days", "Time", "Conflict Types"],
      ...conflictReportRows.map((course) => [
        "Unresolved",
        course.conflicts.includes("course") ? "1 - Course" : course.conflicts.includes("instructor") ? "2 - Instructor" : course.conflicts.includes("room") ? "3 - Room" : course.conflicts.includes("capacity") ? "4 - Capacity" : "5 - Prerequisite",
        course.gender,
        course.code,
        course.section,
        course.id,
        course.instructor,
        course.room,
        inferRoomCapacity(reportScope, course),
        course.enrolled,
        course.days.join(" / "),
        `${formatMinutes(course.startMinute)} - ${formatMinutes(course.endMinute)}`,
        course.conflicts.join(" / "),
      ]),
      ...crossListedGroups.flatMap((group) => group.courses.map((course) => [
        "Resolved cross-list",
        "Cross-listed",
        course.gender,
        course.code,
        course.section,
        course.id,
        course.instructor,
        course.room,
        inferRoomCapacity(reportScope, course),
        course.enrolled,
        course.days.join(" / "),
        `${formatMinutes(course.startMinute)} - ${formatMinutes(course.endMinute)}`,
        `Linked with ${group.courses.filter((item) => item !== course).map((item) => `${item.code}-${item.section}`).join(" / ")}`,
      ])),
    ];
    const blob = new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Fall_2027_Complete_Course_Conflict_Report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const slotCourses = (slot: number) =>
    filteredCourses.filter(
      (course) => (slot + 8) * 60 < course.endMinute && (slot + 9) * 60 > course.startMinute
    );
  const dayCourses = (day: string, slot: number) =>
    slotCourses(slot).filter((course) => course.days.includes(day as never));
  const toggleDay = (day: string) => {
    setVisibleDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : DAYS.filter((item) => [...current, day].includes(item))
    );
  };

  // Exam Filtering logic
  const filteredExams = useMemo(() => {
    const q = examSearch.toLowerCase().trim();
    return exams.filter((e) => {
      if (examSemester !== "All semesters" && e.semester !== examSemester) return false;
      if (examCollege !== "All colleges" && e.college !== examCollege) return false;
      if (examDepartmentsSelected.length > 0 && !examDepartmentsSelected.includes(e.department)) return false;
      if (examGender !== "All" && e.gender !== examGender) return false;
      if (
        examInstructorsSelected.length > 0 &&
        !examInstructorsSelected.some((person) => [e.instructor, e.proctor1, e.proctor2].includes(person))
      ) return false;
      if (examHour !== "All hours" && e.hour !== examHour) return false;
      if (examRoom !== "All rooms" && e.room !== examRoom) return false;
      if (selectedExamDay !== "All days" && e.day !== selectedExamDay) return false;

      if (examLevel !== "All levels") {
        const num = Number(e.code.match(/\d/)?.[0]);
        const target = ["Freshman", "Sophomore", "Junior", "Senior"].indexOf(examLevel) + 1;
        if (num !== target) return false;
      }

      if (q) {
        const hay = `${e.code} ${e.name} ${e.instructor} ${e.room} ${e.proctor1} ${e.proctor2} ${e.crn}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [exams, examSemester, examCollege, examDepartmentsSelected, examLevel, examGender, examInstructorsSelected, examHour, examRoom, examSearch, selectedExamDay]);

  const toggleExamDay = (day: string) => {
    setVisibleExamDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    );
  };

  const courseOptionPool = useMemo(
    () =>
      courses.filter(
        (course) =>
          (campusTab === "All" || course.gender === campusTab) &&
          (colleges.length === 0 || colleges.some((college) => courseBelongsToCollege(course.code, college))) &&
          (!colleges.includes("CCES") || ccesCourseCatalog.some((item) => item.code === course.code))
      ),
    [campusTab, colleges, courses]
  );
  const courseDepartments = useMemo(
    () => colleges.includes("CCES")
      ? [...CCES_MAJORS]
      : Array.from(new Set(courseOptionPool.map((course) => getCourseParts(course.code).prefix))).sort(),
    [colleges, courseOptionPool]
  );
  const coursePrefixes = useMemo(
    () => Array.from(new Set(courseOptionPool.map((course) => getCourseParts(course.code).prefix))).sort(),
    [courseOptionPool]
  );
  const courseNumericCodes = useMemo(
    () => Array.from(new Set(
      courseOptionPool
        .filter((course) => prefixes.length === 0 || prefixes.includes(getCourseParts(course.code).prefix))
        .map((course) => getCourseParts(course.code).numeric)
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [courseOptionPool, prefixes]
  );
  const courseNameOptions = useMemo(
    () => Array.from(new Set(courseOptionPool.map((course) => course.name))).sort(),
    [courseOptionPool]
  );
  const selectedCcesMajors = departments.filter((department): department is CcesMajor =>
    CCES_MAJORS.includes(department as CcesMajor)
  );
  const configEnabled = colleges.includes("CCES") || selectedCcesMajors.length > 0;
  const configurableCourseRows = useMemo(
    () => ccesCourseCatalog.filter(
      (item) =>
        selectedCcesMajors.length === 0 ||
        selectedCcesMajors.some((major) => item.majors.includes(major))
    ),
    [selectedCcesMajors]
  );
  const configurableCourseOptions = useMemo(
    () => Array.from(
      new Map(configurableCourseRows.map((item) => [item.code, item])).values()
    ).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [configurableCourseRows]
  );
  const courseInstructors = useMemo<string[]>(() => {
    const selectedColleges = colleges.length ? colleges : Object.keys(collegeProfessors);
    return Array.from(new Set(selectedColleges.flatMap((college) =>
      collegeProfessors[college as keyof typeof collegeProfessors] ?? []
    ))).sort();
  }, [colleges]);
  const courseRooms = useMemo(
    () => Array.from(new Set(courseOptionPool.map((course) => course.room))).sort(),
    [courseOptionPool]
  );
  const courseLevels = useMemo(
    () =>
      ["Prep", "Freshman", "Sophomore", "Junior", "Senior"].filter((level) =>
        courseOptionPool.some((course) => getCourseLevel(course.code) === level)
      ),
    [courseOptionPool]
  );
  const courseStatuses = useMemo(
    () => ["Open", "Closed"].filter((option) => courseOptionPool.some((course) => course.status === option)),
    [courseOptionPool]
  );
  const availableTypes = useMemo(
    () => ["Lecture", "Lab"].filter((option) => courseOptionPool.some((course) => course.roomType === option)),
    [courseOptionPool]
  );
  const availableTimeSlots = useMemo(
    () =>
      TIMES.filter((_, index) =>
        courseOptionPool.some((course) => (index + 8) * 60 < course.endMinute && (index + 9) * 60 > course.startMinute)
      ),
    [courseOptionPool]
  );

  const recommendationCollegePool = useMemo(
    () => courses.filter((course) => recommendCollege === "All colleges" || course.college === recommendCollege),
    [courses, recommendCollege]
  );
  const recommendationDepartments = useMemo(
    () => [...new Set(recommendationCollegePool.map((course) => course.code.split(" ")[0]))].sort(),
    [recommendationCollegePool]
  );
  const recommendationDepartmentPool = useMemo(
    () => recommendationCollegePool.filter((course) => recommendDepartmentsSelected.length === 0 || recommendDepartmentsSelected.includes(course.code.split(" ")[0])),
    [recommendationCollegePool, recommendDepartmentsSelected]
  );
  const recommendationCourses = useMemo(
    () => [...new Set(recommendationDepartmentPool.map((course) => `${course.code} · ${course.name}`))].sort(),
    [recommendationDepartmentPool]
  );
  const recommendationCourseCode = recommendCourse === "Select a course" ? "" : recommendCourse.split(" · ")[0];
  const recommendationCourseRecords = useMemo(
    () => recommendationDepartmentPool.filter((course) => course.code === recommendationCourseCode),
    [recommendationDepartmentPool, recommendationCourseCode]
  );
  const recommendationInstructors = useMemo(() => {
    const selectedColleges = recommendCollege === "All colleges"
      ? Object.keys(collegeProfessors)
      : [recommendCollege];
    return [...new Set(selectedColleges.flatMap((college) =>
      collegeProfessors[college as keyof typeof collegeProfessors] ?? []
    ))].sort();
  }, [recommendCollege]);
  const sectionRecommendations = useMemo<SectionRecommendation[]>(() => {
    const templates = recommendationCourseRecords.filter((course) =>
      (recommendCampus === "All campuses" || course.gender === recommendCampus) &&
      course.roomType === recommendType
    );
    if (!templates.length) return [];

    const campuses = [...new Set(templates.map((course) => course.gender))];
    const instructors = recommendInstructor === "All instructors"
      ? [...new Set(templates.map((course) => course.instructor))]
      : [recommendInstructor];
    const patterns = [...new Map(
      courses
        .filter((course) => campuses.includes(course.gender) && course.roomType === recommendType)
        .flatMap((course) => course.days.map((day) => [`${day}:${course.startMinute}:${course.endMinute}`, { day, startMinute: course.startMinute, endMinute: course.endMinute }]))
    ).values()];
    const recommendations: SectionRecommendation[] = [];

    campuses.forEach((campus) => {
      const rooms = [...new Set(courses.filter((course) => course.gender === campus && course.roomType === recommendType && course.room !== "-").map((course) => course.room))]
        .map((room) => ({
          room,
          capacity: Math.max(...courses.filter((course) => course.gender === campus && course.room === room).map((course) => course.maxEnrollment), 0),
        }))
        .filter((room) => room.capacity > 0);

      patterns.forEach((pattern) => {
        rooms.forEach(({ room, capacity }) => {
          instructors.forEach((instructor) => {
            const overlaps = courses.some((course) =>
              course.gender === campus &&
              course.days.includes(pattern.day) &&
              pattern.startMinute < course.endMinute &&
              pattern.endMinute > course.startMinute &&
              (course.room === room || course.instructor === instructor)
            );
            if (overlaps) return;
            const template = templates.find((course) => course.gender === campus && course.instructor === instructor) ?? templates[0];
            const targetCapacity = Math.max(template.maxEnrollment, template.enrolled);
            const instructorLoad = courses.filter((course) => course.instructor === instructor).length;
            recommendations.push({
              course: template,
              campus,
              instructor,
              room,
              roomCapacity: capacity,
              day: pattern.day,
              startMinute: pattern.startMinute,
              endMinute: pattern.endMinute,
              score: Math.abs(capacity - targetCapacity) + instructorLoad,
            });
          });
        });
      });
    });

    return recommendations.sort((a, b) => a.score - b.score || a.startMinute - b.startMinute).slice(0, 5);
  }, [courses, recommendCampus, recommendInstructor, recommendType, recommendationCourseCode, recommendationCourseRecords]);

  const createRecommendedSection = () => {
    const recommendation = sectionRecommendations[selectedRecommendation];
    if (!recommendation) return;
    const currentNumbers = courses
      .filter((course) => course.code === recommendation.course.code && course.gender === recommendation.campus)
      .map((course) => Number(course.section))
      .filter(Number.isFinite);
    const nextSection = String(currentNumbers.length ? Math.max(...currentNumbers) + 1 : recommendation.campus === "Female" ? 201 : 101);
    const capacity = Math.max(recommendation.course.maxEnrollment, Math.min(recommendation.roomCapacity, 40));
    const newCourse: ScheduleCourse = {
      ...recommendation.course,
      id: `NEW-${Date.now()}`,
      section: nextSection,
      instructor: recommendation.instructor,
      room: recommendation.room,
      gender: recommendation.campus,
      days: [recommendation.day],
      startMinute: recommendation.startMinute,
      endMinute: recommendation.endMinute,
      maxEnrollment: capacity,
      enrolled: 0,
      available: capacity,
      status: "Open",
      conflicts: [],
    };
    setCourses((current) => recalculateConflicts([...current, newCourse]));
    setShowRecommendations(false);
  };

  const examOptionPool = useMemo(
    () =>
      exams.filter(
        (exam) =>
          (examGender === "All" || exam.gender === examGender) &&
          (examCollege === "All colleges" || exam.college === examCollege)
      ),
    [examCollege, examGender, exams]
  );
  const examDepartments = useMemo(
    () => Array.from(new Set(examOptionPool.map((e) => e.department))).sort(),
    [examOptionPool]
  );
  const examInstructors = useMemo(
    () =>
      Array.from(
        new Set(examOptionPool.flatMap((e) => [e.instructor, e.proctor1, e.proctor2]).filter(Boolean))
      ).sort(),
    [examOptionPool]
  );
  const examRooms = useMemo(
    () => Array.from(new Set(examOptionPool.map((e) => e.room).filter(Boolean))).sort(),
    [examOptionPool]
  );

  useEffect(() => {
    setDepartments((current) => keepValidSelections(current, courseDepartments));
    setInstructors((current) => keepValidSelections(current, courseInstructors));
    setRooms((current) => keepValidSelections(current, courseRooms));
    setLevels((current) => keepValidSelections(current, courseLevels));
    setStatuses((current) => {
      const validStatuses = current.filter((item) => courseStatuses.includes(item));
      const next = validStatuses.length > 0 ? validStatuses : courseStatuses;
      return next.length === current.length && next.every((item, index) => item === current[index])
        ? current
        : next;
    });
    setTypes((current) => {
      const validTypes = current.filter((option) => availableTypes.includes(option));
      const next = validTypes.length > 0 ? validTypes : availableTypes;
      return next.length === current.length && next.every((item, index) => item === current[index])
        ? current
        : next;
    });
    setTimeSlots((current) => keepValidSelections(current, availableTimeSlots));
  }, [
    availableTimeSlots,
    availableTypes,
    courseDepartments,
    courseInstructors,
    courseLevels,
    courseRooms,
    courseStatuses,
  ]);
  const activeCourseFilterCount =
    (colleges.length ? 1 : 0) +
    (departments.length ? 1 : 0) +
    (levels.length ? 1 : 0) +
    (types.length < availableTypes.length ? 1 : 0) +
    (statuses.length < courseStatuses.length ? 1 : 0) +
    (instructors.length ? 1 : 0) +
    (timeSlots.length ? 1 : 0) +
    (rooms.length ? 1 : 0) +
    (courseNames.length ? 1 : 0) +
    (prefixes.length ? 1 : 0) +
    (numericCodes.length ? 1 : 0) +
    (visibleDays.length < DAYS.length ? 1 : 0);

  useEffect(() => {
    setExamDepartmentsSelected((current) => current.filter((item) => examDepartments.includes(item)));
    setExamInstructorsSelected((current) => current.filter((item) => examInstructors.includes(item)));
    if (examRoom !== "All rooms" && !examRooms.includes(examRoom)) setExamRoom("All rooms");
  }, [examDepartments, examInstructors, examRoom, examRooms]);

  return (
    <div className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="brand-copy">
            <strong>Schedule Intelligence</strong>
            <small>University Academic Data Warehouse</small>
          </span>
        </div>
        <div className="topbar-actions">
          <span className="live-indicator">
            <i></i> Live schedule system
          </span>
          <Button variant="secondary" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            <Icon name={theme === "light" ? "moon" : "sun"} />
            {theme === "light" ? "Dark mode" : "Light mode"}
          </Button>
          {activeTab === "courses" && (
            <>
              <Button variant="secondary" onClick={() => { setConflictReportSnapshot(null); setShowConflictReport(true); }}>
                <Icon name="fileText" /> Generate conflict report
              </Button>
              <Button onClick={() => setShowRecommendations(true)}>
                <Icon name="plus" /> Add section
              </Button>
            </>
          )}
        </div>
      </header>

      <main>
        {/* Primary workspace navigation */}
        <nav className="main-nav-tabs" role="tablist" aria-label="Schedule Views">
          <button
            className={`main-nav-tab ${activeTab === "courses" ? "main-nav-tab--active" : ""}`}
            onClick={() => setActiveTab("courses")}
            role="tab"
            aria-selected={activeTab === "courses"}
          >
            <Icon name="calendar" size={16} />
            <span>Course Schedule</span>
            <b>{courses.length} sections</b>
          </button>
          <button
            className={`main-nav-tab ${activeTab === "grades" ? "main-nav-tab--active" : ""}`}
            onClick={() => setActiveTab("grades")}
            role="tab"
            aria-selected={activeTab === "grades"}
          >
            <Icon name="chart" size={16} />
            <span>Grade Analysis</span>
            <b>46 courses</b>
          </button>
          <button
            className={`main-nav-tab ${activeTab === "exams" ? "main-nav-tab--active" : ""}`}
            onClick={() => setActiveTab("exams")}
            role="tab"
            aria-selected={activeTab === "exams"}
          >
            <Icon name="fileText" size={16} />
            <span>Exam Schedule</span>
            <b>{exams.length} exams</b>
          </button>
        </nav>

        {activeTab === "courses" ? (
          <>
            <section className="page-intro">
              <div>
                <div className="eyebrow">
                  <Icon name="calendar" size={14} /> Academic timetable
                </div>
                <h1>Weekly course schedule</h1>
                <p>Review campus-wide utilization, identify conflicts, and inspect section details.</p>
              </div>
              <div className="semester-block">
                <span>Viewing semester</span>
                <button>
                  Fall 2027 <Icon name="chevron" size={15} />
                </button>
              </div>
            </section>

            <section className="workspace-card import-strip">
              <div className="import-copy">
                <span className="step-number">✓</span>
                <div>
                  <strong>Fall 2027 workbooks loaded</strong>
                  <small>
                    {currentMeta.femaleSections} female and {currentMeta.maleSections} male scheduled sections.
                    Uploading replaces that campus.
                  </small>
                </div>
              </div>
              <div className="import-actions">
                <FileImport label="Male schedule" campus="Male" onImport={handleImport} />
                <FileImport label="Female schedule" campus="Female" onImport={handleImport} />
              </div>
            </section>

            <section className="stats-grid">
              <StatCard value={currentMeta.totalSections.toLocaleString()} label="Scheduled sections" detail="Excel data" />
              <StatCard value={currentMeta.enrollment.toLocaleString()} label="Total enrollment" detail={`${currentMeta.rooms} rooms`} />
              <StatCard value={currentMeta.openSections.toLocaleString()} label="Open sections" detail={`${currentMeta.closedSections} closed`} />
              <StatCard
                value={currentMeta.conflictSections.toLocaleString()}
                label="Sections with conflicts"
                detail={`${currentMeta.capacityIssues} capacity`}
                tone="warning"
              />
            </section>

            <section className="workspace-card schedule-card">
              <div className="schedule-toolbar">
                <div className="toolbar-title">
                  <h2>Schedule overview</h2>
                  <span>
                    {filteredCourses.length} sections · {timeSlots.length || TIMES.length} time slots · 08:00–23:59
                  </span>
                </div>
                <div className="toolbar-actions">
                  <label className="search-control">
                    <Icon name="search" size={17} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search CRN, course code, prefix, or name…"
                    />
                  </label>
                  <Button
                    variant={showFilters ? "primary" : "secondary"}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    Filters{" "}
                    {activeCourseFilterCount > 0 ? <b className="filter-count">{activeCourseFilterCount}</b> : null}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!configEnabled}
                    onClick={() => setShowCourseConfig(true)}
                  >
                    Configure
                  </Button>
                </div>
              </div>

              <div className={`schedule-body ${showFilters ? "schedule-body--filtered" : ""}`}>
                {showFilters && (
                  <aside className="filters" aria-label="Schedule filters">
                    <SearchableMultiFilter
                      label="College"
                      values={colleges}
                      options={Object.keys(collegeNames)}
                      emptyLabel="All colleges"
                      onChange={(values) => {
                        setColleges(values);
                        setDepartments([]);
                        setCourseNames([]);
                        setPrefixes([]);
                        setNumericCodes([]);
                        setConfiguredCourses(Array.from(new Set(ccesCourseCatalog.map((item) => item.code))));
                        setConfigCategories({ MATH: true, GEIT: true, Electives: true });
                      }}
                    />
                    <SearchableMultiFilter
                      label="Department"
                      values={departments}
                      options={courseDepartments}
                      emptyLabel="All departments"
                      onChange={(values) => {
                        setDepartments(values);
                        setConfiguredCourses(Array.from(new Set(ccesCourseCatalog.map((item) => item.code))));
                        setConfigCategories({ MATH: true, GEIT: true, Electives: true });
                      }}
                    />
                    <fieldset className="day-filter">
                      <legend>Days</legend>
                      <div>
                        {DAYS.map((day) => (
                          <label key={day} title={day}>
                            <input
                              type="checkbox"
                              checked={visibleDays.includes(day)}
                              onChange={() => toggleDay(day)}
                            />
                            <span>{DAY_LABELS[day]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <SearchableMultiFilter
                      label="Course name"
                      values={courseNames}
                      options={courseNameOptions}
                      emptyLabel="All course names"
                      onChange={setCourseNames}
                    />
                    <SearchableMultiFilter
                      label="Prefix"
                      values={prefixes}
                      options={coursePrefixes}
                      emptyLabel="All prefixes"
                      onChange={(values) => {
                        setPrefixes(values);
                        const validCodes = Array.from(new Set(
                          courseOptionPool
                            .filter((course) => values.length === 0 || values.includes(getCourseParts(course.code).prefix))
                            .map((course) => getCourseParts(course.code).numeric)
                            .filter(Boolean)
                        ));
                        setNumericCodes((current) => keepValidSelections(current, validCodes));
                      }}
                    />
                    <SearchableMultiFilter
                      label="Numeric course code"
                      values={numericCodes}
                      options={courseNumericCodes}
                      emptyLabel="All course codes"
                      onChange={setNumericCodes}
                    />
                    <SearchableMultiFilter
                      label="Course level"
                      values={levels}
                      options={courseLevels}
                      emptyLabel="All levels"
                      onChange={setLevels}
                    />
                    <CheckboxFilter label="Type" values={types} options={availableTypes} onChange={setTypes} />
                    <CheckboxFilter label="Status" values={statuses} options={courseStatuses} onChange={setStatuses} />
                    <SearchableMultiFilter
                      label="Instructor"
                      values={instructors}
                      options={courseInstructors}
                      emptyLabel="All instructors"
                      colorSelections
                      onChange={setInstructors}
                    />
                    <MultiSelect label="Time slots" values={timeSlots} options={availableTimeSlots} onChange={setTimeSlots} />
                    <SearchableMultiFilter
                      label="Room number"
                      values={rooms}
                      options={courseRooms}
                      emptyLabel="All rooms"
                      onChange={setRooms}
                    />
                    <button
                      className="reset-button"
                      onClick={() => {
                        setColleges([]);
                        setDepartments([]);
                        setInstructors([]);
                        setLevels([]);
                        setRooms([]);
                        setStatuses(["Open", "Closed"]);
                        setTimeSlots([]);
                        setTypes(["Lecture", "Lab"]);
                        setCourseNames([]);
                        setPrefixes([]);
                        setNumericCodes([]);
                        setVisibleDays(DAYS);
                        setSearch("");
                      }}
                    >
                      Reset all
                    </button>
                  </aside>
                )}

                <div className="schedule-main">
                  <div className="campus-tabs" role="tablist" aria-label="Campus schedule">
                {(["All", "Female", "Male"] as const).map((campus) => {
                  const count = campus === "All" ? courses.length : courses.filter((course) => course.gender === campus).length;
                  return (
                    <button
                      key={campus}
                      role="tab"
                      aria-selected={campusTab === campus}
                      className={campusTab === campus ? "campus-tab campus-tab--active" : "campus-tab"}
                      onClick={() => setCampusTab(campus)}
                    >
                      <span>{campus === "All" ? "All Campuses" : `${campus} campus`}</span>
                      <b>{count}</b>
                    </button>
                  );
                })}
                  </div>

                  <div className="schedule-meta">
                <div className="legend">
                  {(Object.keys(collegeNames) as College[]).map((key) => (
                    <span key={key}>
                      <i className={`legend-dot college-${key.toLowerCase()}`}></i>
                      {key}
                    </span>
                  ))}
                </div>
                <label className="conflict-toggle">
                  <input
                    type="checkbox"
                    checked={showConflicts}
                    onChange={(event) => setShowConflicts(event.target.checked)}
                  />
                  <span className="toggle-track">
                    <i></i>
                  </span>
                  Highlight conflicts
                  <b>{filteredCourses.filter((course) => course.conflicts.length > 0).length}</b>
                </label>
                  </div>

                  <div className="table-scroll">
                    <div className={`schedule-table days-${Math.max(visibleDays.length, 1)}`}>
                  <div className="table-header">
                    <div className="table-head table-time">Time</div>
                    {visibleDays.map((day) => (
                      <div className="table-head table-day" key={day}>
                        <strong>{day}</strong>
                        <span>Fall 2027</span>
                      </div>
                    ))}
                    {visibleDays.length === 0 && (
                      <div className="table-head table-day">
                        <strong>No days selected</strong>
                        <span>Use the Days filter to choose</span>
                      </div>
                    )}
                  </div>

                  {TIMES.map((time, slot) => {
                    if (timeSlots.length > 0 && !timeSlots.includes(time)) return null;
                    return (
                      <div className="table-row" key={time}>
                        <div className="time-cell">
                          <strong>{time.split(" – ")[0]}</strong>
                          <span>to {time.split(" – ")[1]}</span>
                        </div>
                        {visibleDays.map((day) => (
                          <div className="day-cell" key={day}>
                            {dayCourses(day, slot).map((course, courseIndex) => (
                              <CourseCard
                                key={`${course.id}-${day}-${course.startMinute}-${course.endMinute}-${course.room}-${course.instructor}-${courseIndex}`}
                                course={course}
                                showConflicts={showConflicts}
                                instructorTrack={
                                  instructors.includes(course.instructor)
                                    ? instructors.indexOf(course.instructor)
                                    : undefined
                                }
                                onSelect={setSelectedCourse}
                              />
                            ))}
                          </div>
                        ))}
                        {visibleDays.length === 0 && <div className="day-cell day-cell--empty">Select days in Filters</div>}
                      </div>
                    );
                  })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : activeTab === "grades" ? (
          <GradeAnalysis />
        ) : (
          /* ========================================================= */
          /* EXAM SCHEDULE VIEW                                        */
          /* ========================================================= */
          <>
            <section className="page-intro">
              <div>
                <div className="eyebrow">
                  <Icon name="fileText" size={14} /> Exam Schedule Visualization & Conflict Analysis
                </div>
                <h1>Weekly Final Exam & Proctoring Schedule</h1>
                <p>
                  Comprehensive final exam timetable. Each exam is indicated with color-coded college dots
                  (Pink: COAD, Green: CSHS, Blue: CCES, Yellow: COBA, Orange: COE, Purple: COL) with automated conflict detection.
                </p>
              </div>
              <div className="semester-block">
                <span>Finalized Schedule</span>
                <button>
                  {examSemester} <Icon name="chevron" size={15} />
                </button>
              </div>
            </section>

            {/* Exam Conflict summary callout if conflicts detected */}
            {exams.some((e) => e.conflicts.length > 0) && (
              <section className="exam-conflict-banner">
                <div className="exam-conflict-banner__head">
                  <strong>
                    <Icon name="warningTriangle" size={18} />
                    <span>Exam Scheduling & Proctoring Conflicts Detected ({examMeta.withConflicts} exams affected)</span>
                  </strong>
                  <span className="text-xs font-semibold text-rose-700">Strict constraint violation rules active</span>
                </div>
                <div className="exam-conflict-list">
                  <div className="exam-conflict-chip">
                    <Icon name="warningTriangle" size={14} />
                    <div>
                      <strong>Room double-booking constraint</strong>
                      A room cannot host two exams at the same time.
                    </div>
                  </div>
                  <div className="exam-conflict-chip">
                    <Icon name="warningTriangle" size={14} />
                    <div>
                      <strong>Proctor concurrent overlap</strong>
                      An instructor/proctor cannot be assigned to two exams at the same time.
                    </div>
                  </div>
                  <div className="exam-conflict-chip">
                    <Icon name="warningTriangle" size={14} />
                    <div>
                      <strong>Proctor daily ceiling (&gt;2 exams)</strong>
                      An instructor can proctor a maximum of two exams per day.
                    </div>
                  </div>
                  <div className="exam-conflict-chip">
                    <Icon name="warningTriangle" size={14} />
                    <div>
                      <strong>Student cohort overload (&gt;2 exams/day)</strong>
                      Students should not have more than two exams on the same day.
                    </div>
                  </div>
                  <div className="exam-conflict-chip">
                    <Icon name="warningTriangle" size={14} />
                    <div>
                      <strong>Dual proctor requirement (&gt;20 students)</strong>
                      Exams with more than 20 students need at least two proctors.
                    </div>
                  </div>
                  <div className="exam-conflict-chip">
                    <Icon name="warningTriangle" size={14} />
                    <div>
                      <strong>Campus gender policy</strong>
                      Female instructors can only proctor exams on the female campus.
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="stats-grid">
              <StatCard value={examMeta.total.toLocaleString()} label="Total Scheduled Exams" detail={`${examMeta.totalStudents.toLocaleString()} students`} />
              <StatCard value={examMeta.uniqueRooms.toLocaleString()} label="Assigned Exam Rooms" detail="CCES, GZONE, CORE, COBA" />
              <StatCard value={`${examMeta.femaleCount} F / ${examMeta.maleCount} M`} label="Campus Distribution" detail="Section 2xx / 1xx" />
              <StatCard
                value={examMeta.withConflicts.toLocaleString()}
                label="Exams with Rule Warnings"
                detail="Proctoring & room checks"
                tone={examMeta.withConflicts > 0 ? "warning" : undefined}
              />
            </section>

            <section className="workspace-card schedule-card">
              <div className="schedule-toolbar">
                <div className="toolbar-title">
                  <h2>Weekly Exam Timetable</h2>
                  <span>
                    {filteredExams.length} matching exams · 4 exam sessions daily (9:00AM, 12:00PM, 3:00PM, 6:00PM)
                  </span>
                </div>
                <div className="toolbar-actions">
                  <label className="search-control">
                    <Icon name="search" size={17} />
                    <input
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      placeholder="Search exam code, name, instructor, proctor, room…"
                    />
                  </label>
                  <div className="column-picker">
                    <Button variant="secondary" onClick={() => setShowExamColumnPicker(!showExamColumnPicker)}>
                      <Icon name="calendar" size={15} /> Columns <b className="filter-count">{visibleExamDays.length}</b>
                    </Button>
                    {showExamColumnPicker && (
                      <div className="column-menu">
                        <div className="column-menu__head">
                          <strong>Visible exam days</strong>
                          <button onClick={() => setVisibleExamDays([...EXAM_DAYS])}>Show all</button>
                        </div>
                        {EXAM_DAYS.map((day) => (
                          <label key={day}>
                            <input
                              type="checkbox"
                              checked={visibleExamDays.includes(day)}
                              onChange={() => toggleExamDay(day)}
                            />
                            <span>{day}</span>
                          </label>
                        ))}
                        {visibleExamDays.length === 0 && <small>Select at least one day to display.</small>}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={examHighlightConflicts ? "primary" : "secondary"}
                    onClick={() => setExamHighlightConflicts(!examHighlightConflicts)}
                  >
                    <Icon name="warningTriangle" size={14} />
                    <span>Highlight Conflicts ({filteredExams.filter((e) => e.conflicts.length > 0).length})</span>
                  </Button>
                </div>
              </div>

              {/* Comprehensive Exam Filters */}
              <div className="filters">
                <FilterSelect
                  label="Semester"
                  value={examSemester}
                  options={["All semesters", ...EXAM_SEMESTERS]}
                  onChange={setExamSemester}
                />
                <FilterSelect
                  label="College"
                  value={examCollege}
                  options={["All colleges", ...Object.keys(collegeNames)]}
                  onChange={setExamCollege}
                />
                <SearchableMultiFilter
                  label="Department"
                  values={examDepartmentsSelected}
                  options={examDepartments}
                  emptyLabel="All departments"
                  onChange={setExamDepartmentsSelected}
                />
                <FilterSelect
                  label="Course Level"
                  value={examLevel}
                  options={["All levels", "Freshman", "Sophomore", "Junior", "Senior"]}
                  onChange={setExamLevel}
                />
                <FilterSelect
                  label="Time Slot (Hour)"
                  value={examHour}
                  options={["All hours", ...EXAM_HOURS]}
                  onChange={setExamHour}
                />
                <SearchableMultiFilter
                  label="Instructor / Proctor"
                  values={examInstructorsSelected}
                  options={examInstructors}
                  emptyLabel="All instructors"
                  colorSelections
                  onChange={setExamInstructorsSelected}
                />
                <FilterSelect
                  label="Room Number"
                  value={examRoom}
                  options={["All rooms", ...examRooms]}
                  onChange={setExamRoom}
                />
                <button
                  className="reset-button"
                  onClick={() => {
                    setExamSemester("Spring 2026");
                    setExamCollege("All colleges");
                    setExamDepartmentsSelected([]);
                    setExamLevel("All levels");
                    setExamGender("All");
                    setExamHour("All hours");
                    setExamInstructorsSelected([]);
                    setExamRoom("All rooms");
                    setExamSearch("");
                    setSelectedExamDay("All days");
                  }}
                >
                  Reset Exam Filters
                </button>
              </div>

              {/* Campus Tabs: Female, Male, All campuses */}
              <div className="campus-tabs" role="tablist" aria-label="Exam Campus schedule">
                {(["All", "Female", "Male"] as const).map((campus) => {
                  const count = campus === "All" ? exams.length : exams.filter((e) => e.gender === campus).length;
                  return (
                    <button
                      key={campus}
                      role="tab"
                      aria-selected={examGender === campus}
                      className={examGender === campus ? "campus-tab campus-tab--active" : "campus-tab"}
                      onClick={() => setExamGender(campus)}
                    >
                      <span>{campus === "All" ? "All Campuses" : `${campus} campus`}</span>
                      <b>{count}</b>
                    </button>
                  );
                })}
              </div>

              {/* Quick Day Selector Pills */}
              <div className="day-pills-bar">
                <span className="day-pills-label">Exam Day:</span>
                <button
                  className={`day-pill-btn ${selectedExamDay === "All days" ? "day-pill-btn--active" : ""}`}
                  onClick={() => setSelectedExamDay("All days")}
                >
                  All days <b>{exams.length}</b>
                </button>
                {EXAM_DAYS.map((day) => {
                  const dayCount = exams.filter((e) => e.day === day).length;
                  const isSelected = selectedExamDay === day;
                  return (
                    <button
                      key={day}
                      className={`day-pill-btn ${isSelected ? "day-pill-btn--active" : ""}`}
                      onClick={() => setSelectedExamDay(isSelected ? "All days" : day)}
                    >
                      <span>{day}</span>
                      <b>{dayCount}</b>
                    </button>
                  );
                })}
              </div>

              {/* Legend with Color-Coded Dots */}
              <div className="schedule-meta">
                <div className="legend">
                  {(Object.keys(collegeNames) as College[]).map((key) => (
                    <span key={key}>
                      <i className={`exam-color-dot college-${key.toLowerCase()}`}></i>
                      <strong>{key}</strong> ({collegeNames[key]})
                    </span>
                  ))}
                </div>
                <div className="live-indicator">
                  <i></i> Displaying {filteredExams.length} of {exams.length} exams
                  {selectedExamDay !== "All days" && <strong> · Filtered by {selectedExamDay}</strong>}
                </div>
              </div>

              {/* Weekly Exam Table View */}
              <div className="table-scroll">
                <div
                  className={`schedule-table days-${Math.max(
                    (selectedExamDay !== "All days" ? [selectedExamDay] : visibleExamDays).length,
                    1
                  )}`}
                >
                  <div className="table-header">
                    <div className="table-head table-time">Exam Time</div>
                    {(selectedExamDay !== "All days" ? [selectedExamDay] : visibleExamDays).map((day) => {
                      const isSelected = selectedExamDay === day;
                      return (
                        <div
                          className={`table-head table-day table-day--clickable ${
                            isSelected ? "table-day--selected" : ""
                          }`}
                          key={day}
                          onClick={() => setSelectedExamDay(isSelected ? "All days" : day)}
                          title="Click to isolate this day or reset to all days"
                          role="button"
                          tabIndex={0}
                        >
                          <strong>{day}</strong>
                          <span>Final Exam Week</span>
                          <span className="day-click-hint">
                            {isSelected ? "✓ Click to show all" : "Click to isolate"}
                          </span>
                        </div>
                      );
                    })}
                    {(selectedExamDay !== "All days" ? [selectedExamDay] : visibleExamDays).length === 0 && (
                      <div className="table-head table-day">
                        <strong>No days selected</strong>
                        <span>Use Columns picker to choose</span>
                      </div>
                    )}
                  </div>

                  {EXAM_HOURS.map((hour) => {
                    if (examHour !== "All hours" && examHour !== hour) return null;
                    const activeDays = selectedExamDay !== "All days" ? [selectedExamDay] : visibleExamDays;
                    return (
                      <div className="table-row" key={hour}>
                        <div className="time-cell">
                          <strong>{hour}</strong>
                          <span>Final Exam Slot</span>
                        </div>
                        {activeDays.map((day) => {
                          const cellExams = filteredExams.filter((e) => e.day === day && e.hour === hour);
                          return (
                            <div className="day-cell exam-day-cell" key={day}>
                              {cellExams.length > 0 ? (
                                cellExams.map((exam) => {
                                  const hasConflicts = exam.conflicts.length > 0;
                                  const trackedInstructorIndex = examInstructorsSelected.findIndex((person) =>
                                    [exam.instructor, exam.proctor1, exam.proctor2].includes(person)
                                  );
                                  return (
                                    <button
                                      key={exam.id}
                                      className={`exam-item-pill ${
                                        trackedInstructorIndex >= 0
                                          ? `instructor-track-${trackedInstructorIndex % 6}`
                                          : ""
                                      } ${
                                        examHighlightConflicts && hasConflicts ? "exam-item-pill--conflict" : ""
                                      }`}
                                      onClick={() => setSelectedExam(exam)}
                                      title={`${exam.code} (${exam.name}) - ${exam.room} - Proctor: ${exam.proctor1 || "None"}`}
                                    >
                                      {/* Color-coded dot by college */}
                                      <span
                                        className={`exam-color-dot college-${exam.college.toLowerCase()}`}
                                        title={`College: ${exam.college}`}
                                      />
                                      <div className="exam-item-info">
                                        <div className="exam-item-title-row">
                                          <strong className="exam-item-code">{exam.code}</strong>
                                          <span className="exam-item-sec">Sec {exam.section} ({exam.gender[0]})</span>
                                          {examHighlightConflicts && hasConflicts && (
                                            <span className="conflict-warning-tag" title={exam.conflicts.map((c) => c.label).join(", ")}>
                                              <Icon name="warningTriangle" size={11} />
                                              {exam.conflicts.length}
                                            </span>
                                          )}
                                        </div>
                                        <div className="exam-item-name">{exam.name}</div>
                                        <div className="exam-item-meta">
                                          <span>{exam.room}</span>
                                          <span>·</span>
                                          <span>{exam.numStudents} sts</span>
                                          <span>·</span>
                                          <span className="exam-item-proctors" title="Proctors assigned">
                                            P: {[exam.proctor1, exam.proctor2].filter(Boolean).join(", ") || "Unassigned"}
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="day-cell--empty">No exams</div>
                              )}
                            </div>
                          );
                        })}
                        {activeDays.length === 0 && <div className="day-cell day-cell--empty">Select columns above</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Course Detail Drawer */}
      {selectedCourse && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedCourse(null)}>
          <aside className="course-detail-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow">
                  <Icon name="calendar" size={14} /> Course details
                </span>
                <h2>{selectedCourse.code}</h2>
                <p>
                  Section {selectedCourse.section} · CRN {selectedCourse.id}
                </p>
              </div>
              <button className="close-button" onClick={() => setSelectedCourse(null)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <div className={`detail-course-banner college-${selectedCourse.college.toLowerCase()}`}>
              <strong>{selectedCourse.name}</strong>
              <span>
                {selectedCourse.college} · {selectedCourse.roomType}
              </span>
            </div>
            <dl className="course-details">
              <div>
                <dt>Instructor</dt>
                <dd>{selectedCourse.instructor}</dd>
              </div>
              <div>
                <dt>Meeting days</dt>
                <dd>{selectedCourse.days.join(", ")}</dd>
              </div>
              <div>
                <dt>Meeting time</dt>
                <dd>
                  {formatMinutes(selectedCourse.startMinute)} – {formatMinutes(selectedCourse.endMinute)}
                </dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{selectedCourse.room}</dd>
              </div>
              <div>
                <dt>Campus</dt>
                <dd>{selectedCourse.gender}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`status-pill status-pill--${selectedCourse.status.toLowerCase()}`}>
                    {selectedCourse.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Enrollment</dt>
                <dd>
                  {selectedCourse.enrolled} / {selectedCourse.maxEnrollment}
                </dd>
              </div>
              <div>
                <dt>Available seats</dt>
                <dd>{selectedCourse.available}</dd>
              </div>
            </dl>
            <div className="detail-conflicts">
              <strong>Conflict analysis</strong>
              {selectedCourse.conflicts.length > 0 ? (
                <div>
                  {selectedCourse.conflicts.map((conflict) => (
                    <span key={conflict}>
                      <Icon name="warningTriangle" size={13} />
                      {conflict}
                    </span>
                  ))}
                </div>
              ) : (
                <p>No conflicts detected for this section.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Exam Detail Drawer */}
      {selectedExam && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedExam(null)}>
          <aside className="course-detail-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow">
                  <Icon name="fileText" size={14} /> Exam & Proctoring Details
                </span>
                <h2>{selectedExam.code}</h2>
                <p>
                  Section {selectedExam.section} · CRN {selectedExam.crn} · {selectedExam.semester}
                </p>
              </div>
              <button className="close-button" onClick={() => setSelectedExam(null)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <div className={`detail-course-banner college-${selectedExam.college.toLowerCase()}`}>
              <strong>{selectedExam.name}</strong>
              <span>
                {selectedExam.college} · {selectedExam.department} Dept · {selectedExam.gender} Campus
              </span>
            </div>

            <dl className="course-details">
              <div>
                <dt>Course Instructor</dt>
                <dd>{selectedExam.instructor || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Exam Day & Date</dt>
                <dd>
                  {selectedExam.day}, {selectedExam.date}
                </dd>
              </div>
              <div>
                <dt>Exam Time Slot</dt>
                <dd>{selectedExam.hour}</dd>
              </div>
              <div>
                <dt>Room / Building</dt>
                <dd>{selectedExam.room}</dd>
              </div>
              <div>
                <dt>Number of Students</dt>
                <dd>
                  <strong>{selectedExam.numStudents}</strong> registered students
                </dd>
              </div>
              <div>
                <dt>Primary Proctor (1)</dt>
                <dd>{selectedExam.proctor1 || "None assigned"}</dd>
              </div>
              <div>
                <dt>Secondary Proctor (2)</dt>
                <dd>
                  {selectedExam.proctor2 ? (
                    selectedExam.proctor2
                  ) : (
                    <span className={selectedExam.numStudents > 20 ? "text-amber-600 font-semibold" : "text-gray-500"}>
                      {selectedExam.numStudents > 20 ? "Required (>20 students) - Missing" : "Not required (≤20)"}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Campus Location</dt>
                <dd>{selectedExam.gender} Campus</dd>
              </div>
            </dl>

            <div className="detail-conflicts">
              <strong>Constraint Violations & Warnings ({selectedExam.conflicts.length})</strong>
              {selectedExam.conflicts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                  {selectedExam.conflicts.map((conflict, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: conflict.severity === "critical" ? "#fee2e2" : "#fef3c7",
                        color: conflict.severity === "critical" ? "#991b1b" : "#854d0e",
                        fontSize: "11px",
                        border: `1px solid ${conflict.severity === "critical" ? "#fca5a5" : "#fde68a"}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold" }}>
                        <Icon name="warningTriangle" size={13} />
                        {conflict.label}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "10px", opacity: 0.9 }}>{conflict.detail}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#15803d", fontSize: "11px", marginTop: "8px" }}>
                  ✓ All exam scheduling, room, proctor assignment, and student cohort constraints satisfied.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Add Section Drawer */}
      {showRecommendations && (
        <div className="drawer-backdrop" onMouseDown={() => setShowRecommendations(false)}>
          <aside className="recommendation-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow">
                  <Icon name="spark" size={14} /> Section planner
                </span>
                <h2>Add a new section</h2>
              </div>
              <button className="close-button" onClick={() => setShowRecommendations(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <p className="drawer-intro">Filter the schedule, select a course, and choose a conflict-free recommendation based on room, instructor, campus, and capacity.</p>
            <div className="drawer-grid">
              <Select label="College" value={recommendCollege} options={["All colleges", ...Object.keys(collegeNames)]} onChange={(value) => { setRecommendCollege(value); setRecommendDepartmentsSelected([]); setRecommendCourse("Select a course"); setRecommendInstructor("All instructors"); setSelectedRecommendation(0); }} />
              <SearchableMultiFilter label="Departments" values={recommendDepartmentsSelected} options={recommendationDepartments} emptyLabel="All departments" onChange={(values) => { setRecommendDepartmentsSelected(values); setRecommendCourse("Select a course"); setRecommendInstructor("All instructors"); setSelectedRecommendation(0); }} />
            </div>
            <Select label="Course" value={recommendCourse} options={["Select a course", ...recommendationCourses]} onChange={(value) => { setRecommendCourse(value); setRecommendInstructor("All instructors"); setSelectedRecommendation(0); }} />
            <Select label="Instructor" value={recommendInstructor} options={["All instructors", ...recommendationInstructors]} onChange={(value) => { setRecommendInstructor(value); setSelectedRecommendation(0); }} />
            <div className="drawer-grid">
              <Select label="Campus" value={recommendCampus} options={["All campuses", "Female", "Male"]} onChange={(value) => { setRecommendCampus(value as "All campuses" | Campus); setSelectedRecommendation(0); }} />
              <Select label="Section type" value={recommendType} options={["Lecture", "Lab"]} onChange={(value) => { setRecommendType(value as "Lecture" | "Lab"); setSelectedRecommendation(0); }} />
            </div>
            <div className="recommendation-title">
              <strong>Recommended sections</strong>
              <span>{sectionRecommendations.length} conflict-free {sectionRecommendations.length === 1 ? "match" : "matches"}</span>
            </div>
            {!recommendationCourseCode && <div className="recommendation-empty"><Icon name="spark" size={17} /><strong>Select a course</strong><span>Recommendations will appear here automatically.</span></div>}
            {recommendationCourseCode && sectionRecommendations.length === 0 && <div className="recommendation-empty"><Icon name="warning" size={17} /><strong>No conflict-free matches</strong><span>Try another campus, instructor, or section type.</span></div>}
            {sectionRecommendations.map((item, index) => (
              <button className={`recommendation ${index === 0 ? "recommendation--best" : ""} ${selectedRecommendation === index ? "recommendation--selected" : ""}`} onClick={() => setSelectedRecommendation(index)} key={`${item.campus}-${item.day}-${item.startMinute}-${item.room}-${item.instructor}`}>
                <span className="recommendation-rank">{index + 1}</span>
                <span>
                  <strong>{item.day} · {formatMinutes(item.startMinute)} – {formatMinutes(item.endMinute)}</strong>
                  <small>
                    {item.campus} · {item.room} · {item.roomCapacity} seats
                  </small>
                  <small>{item.instructor}</small>
                </span>
                {index === 0 && <i>Best match</i>}
              </button>
            ))}
            <div className="constraint-note">
              <Icon name="warning" size={17} />
              <span>
                <strong>All constraints checked</strong>Room and instructor availability, capacity, course overlap, campus, room type, and approved schedule patterns.
              </span>
            </div>
            <Button className="drawer-action" onClick={createRecommendedSection} disabled={!sectionRecommendations.length}>Create section from recommendation</Button>
          </aside>
        </div>
      )}

      {showCourseConfig && configEnabled && (
        <div className="drawer-backdrop" onMouseDown={() => setShowCourseConfig(false)}>
          <aside className="course-config-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow"><Icon name="calendar" size={14} /> CCES schedule</span>
                <h2>Configure courses</h2>
                <p>
                  {selectedCcesMajors.length
                    ? `${selectedCcesMajors.join(", ")} curriculum courses from the CCES dataset`
                    : "All courses from the CCES dataset"}
                </p>
              </div>
              <button className="close-button" onClick={() => setShowCourseConfig(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <label className="course-config-all">
              <input
                type="checkbox"
                checked={
                  configurableCourseOptions.length > 0 &&
                  configurableCourseOptions.every((item) => configuredCourses.includes(item.code))
                }
                onChange={(event) =>
                  setConfiguredCourses(event.target.checked ? configurableCourseOptions.map((item) => item.code) : [])
                }
              />
              <span>
                <strong>Select all courses</strong>
                <small>{configurableCourseOptions.length} course codes</small>
              </span>
            </label>
            <div className="course-config-list">
              {configurableCourseOptions.map((item) => (
                <label key={item.code}>
                  <input
                    type="checkbox"
                    checked={configuredCourses.includes(item.code)}
                    onChange={() =>
                      setConfiguredCourses((current) =>
                        current.includes(item.code)
                          ? current.filter((code) => code !== item.code)
                          : [...current, item.code]
                      )
                    }
                  />
                  <span><strong>{item.code}</strong><small>{item.title}</small></span>
                </label>
              ))}
            </div>
            <div className="course-config-categories">
              <strong>General categories</strong>
              <div>
                {(["MATH", "GEIT", "Electives"] as const).map((category) => (
                  <label key={category} className={category === "Electives" && selectedCcesMajors.length === 0 ? "is-disabled" : ""}>
                    <input
                      type="checkbox"
                      checked={configCategories[category]}
                      disabled={category === "Electives" && selectedCcesMajors.length === 0}
                      onChange={(event) =>
                        setConfigCategories((current) => ({ ...current, [category]: event.target.checked }))
                      }
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
              <small>Electives are determined by the selected major columns in CCES_Courses.</small>
            </div>
            <Button className="drawer-action" onClick={() => setShowCourseConfig(false)}>Apply configuration</Button>
          </aside>
        </div>
      )}

      {/* Course Conflict Report Drawer */}
      {showConflictReport && (
        <div className="drawer-backdrop" onMouseDown={() => setShowConflictReport(false)}>
          <aside className="conflict-report-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow"><Icon name="fileText" size={14} /> Schedule audit</span>
                <h2>Course conflict report</h2>
                <p>Fall 2027 · Complete Course Schedule conflict analysis</p>
              </div>
              <button className="close-button" onClick={() => setShowConflictReport(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>

            <section className="conflict-report-criteria">
              <div>
                <strong>Report scope</strong>
                <span>All {courses.length} Course Schedule sections are included.</span>
              </div>
              <div className="conflict-report-all-scope"><Icon name="calendar" size={16} /><span>All campuses, colleges, departments, levels, statuses, instructors, rooms, time slots, and section types.</span></div>
              <Button onClick={() => setConflictReportSnapshot([...courses])}><Icon name="chart" size={15} /> Generate Complete Report</Button>
            </section>

            {conflictReportSnapshot && <>
            <div className="cross-list-status">
              <Icon name="userCheck" size={18} />
              <span><strong>Cross-listed sections normalized</strong>{crossListedGroups.length} linked meeting groups ({crossListedGroups.reduce((sum, group) => sum + group.courses.length, 0)} section records) are excluded from false room and instructor conflicts.</span>
            </div>

            <div className="conflict-report-summary">
              <article><span>1 · Course</span><strong>{conflictCounts.course}</strong><small>Resolve first</small></article>
              <article><span>2 · Instructor</span><strong>{conflictCounts.instructor}</strong><small>Resolve second</small></article>
              <article><span>3 · Room</span><strong>{conflictCounts.room}</strong><small>Room overlaps</small></article>
              <article><span>4 · Capacity</span><strong>{conflictCounts.capacity}</strong><small>Enrollment issues</small></article>
              <article><span>5 · Prerequisite</span><strong>{conflictCounts.prerequisite}</strong><small>CCES course pairs</small></article>
            </div>

            <div className="conflict-report-heading">
              <div><strong>Unresolved conflicts</strong><span>Prioritized by course, instructor, room, capacity, and CCES prerequisites.</span></div>
              <b>{conflictReportRows.length} sections</b>
            </div>
            <div className="conflict-report-list">
              {conflictReportRows.map((course, index) => (
                <article key={`${course.id}-${course.code}-${course.section}-${index}`}>
                  <span className={`conflict-priority conflict-priority--${course.conflicts.includes("course") ? "course" : course.conflicts.includes("instructor") ? "instructor" : "other"}`}>{course.conflicts.includes("course") ? "Course" : course.conflicts.includes("instructor") ? "Instructor" : course.conflicts[0]}</span>
                  <div><strong>{course.code} · Section {course.section}</strong><span>{course.gender} · {course.days.join(", ")} · {formatMinutes(course.startMinute)}–{formatMinutes(course.endMinute)}</span><small>{course.instructor} · {course.room}{course.conflicts.includes("capacity") ? ` · ${course.enrolled}/${inferRoomCapacity(reportScope, course)} seats` : ""}</small></div>
                  <b>{course.conflicts.join(" · ")}</b>
                </article>
              ))}
              {!conflictReportRows.length && <div className="conflict-report-empty"><Icon name="userCheck" /><strong>No unresolved conflicts</strong><span>The current schedule passes all conflict checks.</span></div>}
            </div>
            <Button className="drawer-action" onClick={downloadConflictReport}><Icon name="fileText" /> Download CSV report</Button>
            </>}
          </aside>
        </div>
      )}
    </div>
  );
}
