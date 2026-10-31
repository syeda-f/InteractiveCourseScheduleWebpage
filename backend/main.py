#FastAPI endpoints for course scheduling and grade distribution analysis.
#run from the project root: uvicorn backend.main:app --reload

import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.schedule_etl import run as run_schedule_etl
from backend.grades_etl import run as run_grades_etl

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"
GRADES_FILE = OUTPUT_DIR / "grades_processed.csv"

app = FastAPI(title="Academic Planning Analytics API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8443",
        "http://127.0.0.1:8443",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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


@app.get("/api/grades")
def get_grades(merge: bool = False, record_type: str = "course"):
    if record_type not in ("course", "section"):
        raise HTTPException(status_code=400, detail="record_type must be 'course' or 'section'")
    if not GRADES_FILE.is_file():
        raise HTTPException(
            status_code=404,
            detail="Grades data not found. Upload grade files or run grades_etl.py first.",
        )
    df = pd.read_csv(GRADES_FILE)
    required = {"record_type", "merge_status"}
    if not required.issubset(df.columns):
        raise HTTPException(status_code=500, detail="Grades CSV lacks record_type/merge_status")
    status = "merged" if merge else "original"
    selected = df.loc[
        df["record_type"].eq(record_type) & df["merge_status"].eq(status)
    ]
    # Convert numpy scalars/NaN into JSON-compatible values.
    return json.loads(selected.to_json(orient="records"))


@app.post("/api/grades/import")
async def import_grades(
    male: UploadFile = File(...),
    female: UploadFile = File(...),
    courses: UploadFile = File(...),
):
    """Upload the three raw grade CSVs; use the server's cross-list mapping."""
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
                run_grades_etl(male_path, female_path, courses_path, mapping)
            )
        except (ValueError, KeyError, AssertionError, pd.errors.ParserError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "message": "Grade ETL completed",
        "output": "grades_processed.csv",
        "original_sections": len(sections_original),
        "merged_sections": len(sections_merged),
        "original_courses": len(courses_original),
        "merged_courses": len(courses_merged),
    }
