import os
from dotenv import load_dotenv
from imagekitio import AsyncImageKit

load_dotenv()

# Read private key from environment or project credentials
_private_key = (os.getenv("IMAGEKIT_PRIVATE_KEY") or "").strip()
if not _private_key:
    _private_key = "private_FJmBI7v4KrTn0rh7Dz8pboU1voU="

imagekit = AsyncImageKit(
    private_key=_private_key
)
