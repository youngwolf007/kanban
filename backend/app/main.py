import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

REPO_ROOT = Path(__file__).parent.parent.parent
STATIC_DIR = Path(os.getenv("STATIC_DIR", REPO_ROOT / "frontend" / "out"))

app = FastAPI(title="Project Management MVP")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Mounted last so the API routes above win. html=True serves index.html at /.
# check_dir=False keeps the app importable when the frontend has not been built,
# so the API tests can run without a Node build; / then 404s until it is built.
app.mount(
    "/",
    StaticFiles(directory=STATIC_DIR, html=True, check_dir=False),
    name="static",
)
