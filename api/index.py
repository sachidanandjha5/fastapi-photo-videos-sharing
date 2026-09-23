import os
import sys

# Add project root directory to Python path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app.app import app as fastapi_app


class VercelPathMiddleware:
    """ASGI Middleware to fix Vercel Serverless Function routing."""

    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            headers = dict(scope.get("headers", []))
            # Vercel passes the original requested path in x-matched-path
            matched_path = headers.get(b"x-matched-path", b"").decode("utf-8")
            if matched_path:
                scope["path"] = matched_path
            elif scope.get("path", "").startswith("/api/index.py"):
                remainder = scope["path"][len("/api/index.py"):]
                scope["path"] = remainder if remainder else "/"
            elif scope.get("path") == "/api":
                scope["path"] = "/"
        await self.asgi_app(scope, receive, send)


app = VercelPathMiddleware(fastapi_app)
