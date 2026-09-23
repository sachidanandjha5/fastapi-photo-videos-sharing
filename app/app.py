from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
import uuid

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Post, User, create_db_and_tables, get_async_session
from app.images import imagekit
from app.schemas import UserCreate, UserRead, UserUpdate
from app.users import (
    UserManager,
    auth_backend,
    current_active_user,
    fastapi_users,
    get_jwt_strategy,
    get_user_manager,
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


class GoogleAuthRequest(BaseModel):
    credential: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    yield
    await imagekit.close()


app = FastAPI(title="FastAPI Photo & Video Sharing", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": traceback.format_exc()},
    )

# Mount Authentication & User Routers
app.include_router(fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"])
app.include_router(fastapi_users.get_register_router(UserRead, UserCreate), prefix="/auth", tags=["auth"])
app.include_router(fastapi_users.get_reset_password_router(), prefix="/auth", tags=["auth"])
app.include_router(fastapi_users.get_verify_router(UserRead), prefix="/auth", tags=["auth"])
app.include_router(fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["users"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


class DirectGoogleAuthRequest(BaseModel):
    email: str


@app.get("/auth/google/client-id")
async def get_google_client_id():
    return {"client_id": os.getenv("GOOGLE_CLIENT_ID", "")}


@app.post("/auth/google/direct")
async def auth_google_direct(
    payload: DirectGoogleAuthRequest,
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    # Find existing user or automatically create new user
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalars().first()

    if not user:
        random_password = secrets.token_urlsafe(32)
        user_create = UserCreate(email=email, password=random_password)
        user = await user_manager.create(user_create)

    # Issue JWT token
    jwt_strategy = get_jwt_strategy()
    token = await jwt_strategy.write_token(user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "email": user.email,
    }


@app.post("/auth/google")
async def auth_google(
    payload: GoogleAuthRequest,
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    credential = payload.credential
    if not credential:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Google credential")

    # Verify ID token with Google's public tokeninfo endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}")
            if res.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Google token",
                )
            google_data = res.json()
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not contact Google verification server: {str(e)}",
        )

    email = google_data.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide a verified email",
        )

    # Find or register user
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalars().first()

    if not user:
        random_password = secrets.token_urlsafe(32)
        user_create = UserCreate(email=email, password=random_password)
        user = await user_manager.create(user_create)

    # Issue JWT token
    jwt_strategy = get_jwt_strategy()
    token = await jwt_strategy.write_token(user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "email": user.email,
    }

# Mount static frontend assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    for candidate in [
        STATIC_DIR / "index.html",
        Path("static/index.html"),
        Path(__file__).resolve().parent.parent / "static" / "index.html",
    ]:
        if candidate.exists():
            return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    caption: str = Form(""),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    try:
        file_bytes = await file.read()
        content_type = file.content_type or ""
        if content_type.startswith("video/"):
            file_type = "video"
        elif content_type.startswith("image/"):
            file_type = "image"
        elif content_type.startswith("audio/"):
            file_type = "audio"
        else:
            file_type = "document"

        upload_result = await imagekit.files.upload(
            file=file_bytes,
            file_name=file.filename or "upload",
            use_unique_file_name=True,
            tags=["backend-upload"],
        )

        post = Post(
            user_id=user.id,
            caption=caption,
            url=upload_result.url,
            file_type=file_type,
            file_name=upload_result.name or file.filename or "upload",
            created_at=datetime.now(timezone.utc),
        )
        session.add(post)
        await session.commit()
        await session.refresh(post)

        return {
            "id": str(post.id),
            "user_id": str(post.user_id),
            "caption": post.caption,
            "url": post.url,
            "file_type": post.file_type,
            "file_name": post.file_name,
            "created_at": post.created_at.isoformat(),
            "email": user.email,
            "is_owner": True,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}",
        )
    finally:
        await file.close()


@app.get("/feed")
async def get_feed(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await session.execute(select(Post).order_by(Post.created_at.desc()))
    posts = result.scalars().all()

    user_result = await session.execute(select(User))
    users = user_result.scalars().all()
    user_dict = {u.id: u.email for u in users}

    posts_data = []
    for post in posts:
        posts_data.append(
            {
                "id": str(post.id),
                "user_id": str(post.user_id),
                "caption": post.caption,
                "url": post.url,
                "file_type": post.file_type,
                "file_name": post.file_name,
                "created_at": post.created_at.isoformat() if post.created_at else None,
                "is_owner": post.user_id == user.id,
                "email": user_dict.get(post.user_id, "Unknown"),
            }
        )

    return {"posts": posts_data}


@app.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    try:
        post_uuid = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid post ID")

    result = await session.execute(select(Post).where(Post.id == post_uuid))
    post = result.scalars().first()

    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    if post.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this post",
        )

    await session.delete(post)
    await session.commit()
    return {"success": True, "message": "Post deleted successfully"}