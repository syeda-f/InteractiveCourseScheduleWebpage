
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.schedule_etl import run # runs the ETL process

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.post("/upload-schedule")
async def upload_schedule(
    female: UploadFile = File(...),
    male: UploadFile = File(...)
):

    with TemporaryDirectory() as folder:

        folder = Path(folder)

        female_path = folder / "female.csv"
        male_path = folder / "male.csv"

        female_path.write_bytes(await female.read())
        male_path.write_bytes(await male.read())

        original, merged = run(
            female_path,
            male_path,
            "backend/data/Nomenclature.csv",
            "backend/data/Cross_Listed_Codes.csv"
        )

        # save original & merged datasets
        output_folder = Path("backend/output")
        output_folder.mkdir(exist_ok=True)

        original.to_csv(
            output_folder / "schedule_original.csv",
            index=False
        )

        merged.to_csv(
            output_folder / "schedule_merged.csv",
            index=False
        )

        print("Original rows:", len(original))
        print("Merged rows:", len(merged))
        print("Original enrollment:", original["enrl"].sum())
        print("Merged enrollment:", merged["enrl"].sum())

        return {
            "message": "ETL completed",
            "original_rows": len(original),
            "merged_rows": len(merged)
        }

@app.get("/")
def root():
    return {"status": "ok", "service": "course-schedule-api"}