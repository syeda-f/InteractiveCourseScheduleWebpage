from typing import Optional
from pydantic import BaseModel
#FastAPI endpoints for course scheduling and grade distribution analysis.
#run from the project root: uvicorn backend.main:app --reload

import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.schedule_etl import run as run_schedule_etl
from backend.grades_etl import run as run_grades_etl

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"
GRADES_FILE = OUTPUT_DIR / "grades_processed.csv"
GRADES_DIR = OUTPUT_DIR / "grades"

app = FastAPI(title="Academic Planning Analytics API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8443", "http://127.0.0.1:8443", "http://192.168.1.5:8443"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_reference_file(name):
    path = DATA_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=400, detail="Missing reference file: " + str(path))
    return path


@app.get("/")
def root():
    return {"status": "ok", "service": "academic-planning-api"}


@app.post("/upload-schedule")
async def upload_schedule(female: UploadFile = File(...), male: UploadFile = File(...)):
    nomenclature = require_reference_file("Nomenclature.csv")
    mapping = require_reference_file("Cross_Listed_Codes.csv")
    with TemporaryDirectory() as folder:
        folder = Path(folder)
        female_path = folder / "female.csv"
        male_path = folder / "male.csv"
        female_path.write_bytes(await female.read())
        male_path.write_bytes(await male.read())
        try:
            original, merged = run_schedule_etl(
                female_path, male_path, nomenclature, mapping
            )
        except (ValueError, KeyError, pd.errors.ParserError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    original.to_csv(OUTPUT_DIR / "schedule_original.csv", index=False)
    merged.to_csv(OUTPUT_DIR / "schedule_merged.csv", index=False)
    return {
        "message": "Schedule ETL completed",
        "original_rows": len(original),
        "merged_rows": len(merged),
        "original_enrollment": int(original["enrl"].sum()),
        "merged_enrollment": int(merged["enrl"].sum()),
    }


def available_grade_files():
    files = {path.stem.removeprefix("grades_"): path for path in GRADES_DIR.glob("grades_*.csv")} if GRADES_DIR.exists() else {}
    # Backward compatibility: retain legacy Fall 2025 data until explicitly reimported.
    if GRADES_FILE.is_file() and "202510" not in files:
        files["202510"] = GRADES_FILE
    return files


@app.get("/api/grades/semesters")
def grade_semesters():
    return sorted(available_grade_files().keys(), reverse=True)


@app.get("/api/grades")
def get_grades(merge: bool = False, record_type: str = "course", semester: Optional[str] = None):
    if record_type not in ("course", "section"):
        raise HTTPException(status_code=400, detail="record_type must be 'course' or 'section'")
    files = available_grade_files()
    if semester is not None:
        if semester not in files:
            raise HTTPException(status_code=404, detail=f"No grades imported for semester {semester}")
        files = {semester: files[semester]}
    if not files:
        raise HTTPException(status_code=404, detail="Grades data not found. Import grade files first.")
    frames = []
    for term, path in sorted(files.items()):
        df = pd.read_csv(path)
        if not {"record_type", "merge_status"}.issubset(df.columns):
            raise HTTPException(status_code=500, detail=f"Invalid grades file: {path.name}")
        df["term_code"] = term
        frames.append(df.loc[df["record_type"].eq(record_type) & df["merge_status"].eq("merged" if merge else "original")])
    return json.loads(pd.concat(frames, ignore_index=True).to_json(orient="records"))


def detect_grade_semester(uploads: list[UploadFile]) -> str:
    """Detect a single university term code from source filenames or report headers."""
    codes = set()
    # Require an explicit six-digit code, not a guessed year/season mapping.
    pattern = re.compile(r"(?<!\d)(20\d{4})(?!\d)")
    for upload in uploads:
        codes.update(pattern.findall(upload.filename or ""))
        # Raw report header rows precede the grade table (skiprows=3 in ETL).
        # Inspect only the header, avoiding accidental codes in student data.
        position = upload.file.tell()
        upload.file.seek(0)
        header = upload.file.read(4096).decode("utf-8-sig", errors="replace").splitlines()[:3]
        upload.file.seek(position)
        codes.update(pattern.findall("\n".join(header)))
    if len(codes) != 1:
        reason = "No semester code was found" if not codes else "Conflicting semester codes were found: " + ", ".join(sorted(codes))
        raise HTTPException(status_code=422, detail=reason + ". Include the same six-digit semester code (such as 202510) in a source filename or report header.")
    return codes.pop()


@app.post("/api/grades/import")
async def import_grades(
    male: UploadFile = File(...),
    female: UploadFile = File(...),
    courses: UploadFile = File(...),
    replace_existing: bool = Form(False),
):
    """Upload the three raw grade CSVs; use the server's cross-list mapping."""
    semester = detect_grade_semester([male, female, courses])
    target = GRADES_DIR / f"grades_{semester}.csv"
    if target.exists() and not replace_existing:
        raise HTTPException(status_code=409, detail=f"Semester {semester} already exists. Confirm replacement to reimport it.")
    mapping = require_reference_file("Cross_Listed_Codes.csv")
    with TemporaryDirectory() as folder:
        folder = Path(folder)
        male_path = folder / "male.csv"
        female_path = folder / "female.csv"
        courses_path = folder / "courses.csv"
        male_path.write_bytes(await male.read())
        female_path.write_bytes(await female.read())
        courses_path.write_bytes(await courses.read())
        try:
            sections_original, sections_merged, courses_original, courses_merged = (
                run_grades_etl(male_path, female_path, courses_path, mapping, term_code=semester)
            )
        except (ValueError, KeyError, AssertionError, pd.errors.ParserError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "message": "Grade ETL completed",
        "output": f"grades/grades_{semester}.csv",
        "semester": semester,
        "original_sections": len(sections_original),
        "merged_sections": len(sections_merged),
        "original_courses": len(courses_original),
        "merged_courses": len(courses_merged),
    }


# Course Scheduling: durable, per-semester and per-campus processed records.
# Store JSON to preserve array-valued meeting days and conflict details exactly.
SCHEDULES_DIR = OUTPUT_DIR / "schedules"

class ScheduleImportPayload(BaseModel):
    semester: str
    campus: str
    records: list


def _schedule_file(semester, campus):
    if not re.fullmatch(r"\d{6}", semester):
        raise HTTPException(status_code=422, detail="Semester must be a six-digit TERM CODE")
    if campus not in ("Male", "Female"):
        raise HTTPException(status_code=422, detail="Campus must be Male or Female")
    return SCHEDULES_DIR / ("schedule_" + semester + "_" + campus.lower() + ".json")


@app.get("/api/schedules/semesters")
def list_schedule_semesters():
    semesters = {}
    for path in SCHEDULES_DIR.glob("schedule_*_*.json") if SCHEDULES_DIR.exists() else []:
        match = re.fullmatch(r"schedule_(\d{6})_(male|female)\.json", path.name)
        if match:
            semesters.setdefault(match.group(1), []).append(match.group(2).title())
    return {"semesters": [
        {"semester": term, "campuses": sorted(campuses)}
        for term, campuses in sorted(semesters.items(), reverse=True)
    ]}


@app.get("/api/schedules")
def get_schedule_semester(semester: str):
    records = []
    for campus in ("Male", "Female"):
        path = _schedule_file(semester, campus)
        if path.exists():
            records.extend(json.loads(path.read_text(encoding="utf-8")))
    if not records:
        raise HTTPException(status_code=404, detail="No imported schedules for semester " + semester)
    return {"semester": semester, "records": records}


@app.post("/api/schedules/import")
def import_schedule_semester(payload: ScheduleImportPayload, overwrite: bool = False):
    path = _schedule_file(payload.semester, payload.campus)
    if path.exists() and not overwrite:
        raise HTTPException(status_code=409, detail="This semester/campus already exists. Confirm replacement first.")
    if not payload.records:
        raise HTTPException(status_code=422, detail="No schedule records to import")
    for record in payload.records:
        if not isinstance(record, dict) or record.get("gender") != payload.campus:
            raise HTTPException(status_code=422, detail="Record campus does not match selected campus")
        if not isinstance(record.get("days"), list) or not record.get("code"):
            raise HTTPException(status_code=422, detail="Invalid schedule record")
    SCHEDULES_DIR.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload.records, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)
    return {"message": "Schedule imported", "semester": payload.semester,
            "campus": payload.campus, "count": len(payload.records)}
