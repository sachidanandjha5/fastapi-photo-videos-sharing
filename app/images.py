import os
from dotenv import load_dotenv
from imagekitio import AsyncImageKit

load_dotenv()

imagekit = AsyncImageKit(
    private_key=os.getenv("IMAGEKIT_PRIVATE_KEY")
)

