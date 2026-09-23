from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Post, User, create_db_and_tables, get_async_session
from app.images import imagekit
from app.schemas import UserCreate, UserRead, UserUpdate
from app.users import auth_backend, current_active_user, fastapi_users

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    yield
    await imagekit.close()


app = FastAPI(title="FastAPI Photo & Video Sharing", lifespan=lifespan)

# Mount Authentication & User Routers
app.include_router(fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"])
app.include_router(fastapi_users.get_register_router(UserRead, UserCreate), prefix="/auth", tags=["auth"])
app.include_router(fastapi_users.get_reset_password_router(), prefix="/auth", tags=["auth"])
app.include_router(fastapi_users.get_verify_router(UserRead), prefix="/auth", tags=["auth"])
app.include_router(fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["users"])

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
        file_type = "video" if content_type.startswith("video/") else "image"

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