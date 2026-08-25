import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.auth import router as auth_router
from app.board import router as board_router
from app.chat import router as chat_router
from app.db import init_db

REPO_ROOT = Path(__file__).parent.parent.parent
STATIC_DIR = Path(os.getenv("STATIC_DIR", REPO_ROOT / "frontend" / "out"))
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-for-local-use-only")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)

# Signs the session cookie. HttpOnly and SameSite=lax by default.
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, same_site="lax")

app.include_router(auth_router)
app.include_router(board_router)
app.include_router(chat_router)


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
