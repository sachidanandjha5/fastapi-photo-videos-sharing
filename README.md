# ShareCare - Secure Cloud Media & Document Drive

**ShareCare** is a modern, full-stack cloud drive application built with **FastAPI** (Python async backend) and modern frontend technologies. It provides seamless, one-click Google Sign-In and private, account-isolated file storage for photos, videos, audio tracks, PDFs, and documents.

---

## 🌟 Key Features

- **⚡ Account-Based Data Isolation**: Every authenticated Google account has its own isolated cloud drive. Files uploaded by Account A can **never** be viewed, downloaded, or deleted by Account B.
- **🔑 One-Click Direct Google Sign-In & OAuth2**: Instant authentication without password friction.
- **📱 Cross-Device Synchronized Identity**: Logging in with the same Google account on a phone, tablet, or desktop opens the exact same private file drive using deterministic UUID mapping.
- **📂 Universal File Support**: Supports images (`jpg`, `png`, `webp`, `gif`), videos (`mp4`, `webm`), audio (`mp3`, `wav`), and documents (`pdf`, `docx`, `txt`, `zip`).
- **🚀 Serverless-Ready Architecture**: Built to deploy effortlessly on Vercel with automatic self-healing cold container synchronization.
- **🔒 High Security**: Server-enforced permissions on every file retrieval (`GET /files/{id}`) and deletion (`DELETE /files/{id}`) rejecting unauthorized access with `403 Forbidden`.

---

## 🏗️ How This Project Works (Architecture & Data Flow)

```
                              USER CLIENT
                       (Mobile, Laptop, Desktop)
                                  │
                                  ▼
                     [ 1. Authentication Layer ]
                    One-Click Google / JWT Bearer
                                  │
                                  ▼
                       FASTAPI BACKEND CORE
       ┌──────────────────────────┴──────────────────────────┐
       │                                                     │
       ▼                                                     ▼
[ 2. Account Resolution ]                           [ 3. Upload & Storage ]
- Normalizes email                                  - Validates file payload
- Computes deterministic UUID                       - Uploads to ImageKit CDN
  uuid.uuid5(NAMESPACE_URL, mailto:email)             (/users/{user_id}/)
- Links session to User record                      - Tags asset with owner ID
       │                                                     │
       └──────────────────────────┬──────────────────────────┘
                                  │
                                  ▼
                      [ 4. Database Layer ]
              SQLite / PostgreSQL (SQLAlchemy Async)
              - User (id: UUID, email: String)
              - Post/File (id, user_id, url, file_name,
                           file_type, imagekit_file_id)
                                  │
                                  ▼
                   [ 5. Security & Isolation ]
              Strict filtering: user_id == current_user.id
```

### 1. Authentication
- The user clicks **Continue with Google** and signs in.
- The backend derives a **deterministic UUIDv5** based on `mailto:{email}`:
  ```python
  user_id = uuid.uuid5(uuid.NAMESPACE_URL, f"mailto:{normalized_email}")
  ```
- This guarantees that the user always gets the exact same `user_id` whether logging in from their phone, laptop, or after a container cold-restart.
- A secure JWT access token embedding `sub` (`user_id`) and `email` is issued.

### 2. File Uploading
- When a user uploads a file, the backend verifies the token and retrieves `current_user.id`.
- The file is uploaded to cloud storage under the user's dedicated folder:
  ```python
  folder = f"/users/{user.id}/"
  tags = [f"owner_{user.id}"]
  ```
- A database record is saved with `user_id = user.id` and `imagekit_file_id`.

### 3. File Retrieval & Dashboard
- When loading the dashboard, the frontend calls `GET /files`.
- The database queries **only** files owned by the current user:
  ```python
  select(Post).where(Post.user_id == user.id).order_by(Post.created_at.desc())
  ```
- Global queries returning other users' files are strictly disallowed.

### 4. Direct Access & Deletion Security
- When requesting or deleting a file (`GET /files/{id}` or `DELETE /files/{id}`), the backend enforces:
  ```python
  if post.user_id != user.id:
      raise HTTPException(status_code=403, detail="Permission denied")
  ```

---

## 💻 Main Code Structure & Key Lines

### 1. Database Schema (`app/db.py`)
```python
class Post(Base):
    __tablename__ = "posts"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("user.id"), nullable=False, index=True)
    caption = Column(Text, default="")
    url = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # 'image', 'video', 'audio', 'document'
    file_name = Column(String, nullable=False)
    imagekit_file_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="posts")
```

### 2. Deterministic Identity Across Devices (`app/users.py`)
```python
def get_deterministic_user_id(email: str) -> uuid.UUID:
    """Guarantees identical UUID for the same Google account across any device."""
    normalized_email = email.strip().lower()
    return uuid.uuid5(uuid.NAMESPACE_URL, f"mailto:{normalized_email}")
```

### 3. Isolated File Retrieval (`app/app.py`)
```python
@app.get("/files")
@app.get("/feed")
async def get_user_files(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    # NEVER LOAD ALL FILES - strictly filter by authenticated user
    result = await session.execute(
        select(Post).where(Post.user_id == user.id).order_by(Post.created_at.desc())
    )
    posts = result.scalars().all()
    return {"files": posts, "user": {"id": str(user.id), "email": user.email}}
```

### 4. Ownership Verification for Deletion (`app/app.py`)
```python
@app.delete("/files/{file_id}")
async def delete_file(file_id: str, session: AsyncSession = Depends(get_async_session), user: User = Depends(current_active_user)):
    result = await session.execute(select(Post).where(Post.id == uuid.UUID(file_id)))
    post = result.scalars().first()
    if not post or post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if post.imagekit_file_id:
        await imagekit.files.delete(file_id=post.imagekit_file_id)
    await session.delete(post)
    await session.commit()
    return {"success": True}
```

---

## 🛠️ Commands Reference

### 1. Environment Setup
```bash
# Clone the repository
git clone https://github.com/sachidanandjha5/fastapi-photo-videos-sharing.git
cd fastapi-photo-videos-sharing

# Create and activate virtual environment
python -m venv .venv

# Windows:
.venv\Scripts\activate

# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configuration (`.env`)
Create a `.env` file in the project root:
```env
IMAGEKIT_PRIVATE_KEY=your_private_key
IMAGEKIT_PUBLIC_KEY=your_public_key
IMAGEKIT_URL=https://ik.imagekit.io/your_id
JWT_SECRET=your_super_secret_jwt_random_key_here
```

### 3. Running the Server Locally
```bash
uvicorn app.app:app --reload --port 8000
```
Open **`http://localhost:8000`** in your browser.  
Swagger API Documentation is available at **`http://localhost:8000/docs`**.

### 4. Running Integration Tests
```bash
python -c "import asyncio; from scratch.test_account_isolation import run_test; asyncio.run(run_test())"
```

### 5. Deployment Commands
```bash
# Check git status
git status

# Commit and push updates to trigger Vercel deployment
git add .
git commit -m "Update ShareCare"
git push origin main
```

---

## 🚀 Future Roadmap & Possible Enhancements

1. **Persistent Cloud Database (PostgreSQL)**:
   - Connect a free managed PostgreSQL database (such as **Neon** or **Supabase**) via `DATABASE_URL` in Vercel settings for full persistence beyond SQLite.
2. **File Sharing & Public Links**:
   - Allow users to generate time-limited, view-only shareable links (`/s/{share_token}`) for specific documents or photos without exposing their entire drive.
3. **Folder & Tag Organization**:
   - Add support for custom subfolders (e.g. `Work`, `Personal`, `Receipts`) and custom user tags.
4. **Full-Text & Keyword Search**:
   - Allow searching by filename, caption, date range, or file type (photos, videos, documents).
5. **Bulk Operations**:
   - Multi-file selection for bulk download (ZIP archive) and batch deletion.
6. **Dark / Light Theme Toggle**:
   - Provide a persistent theme switcher for personalized UI preferences.
7. **Storage Quota & Progress Meter**:
   - Visual progress bar showing total storage utilized per user (e.g., `245 MB / 5 GB used`).
