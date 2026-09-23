from datetime import datetime
import os
from typing import Optional
import uuid

from dotenv import load_dotenv
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase

from app.db import User, get_user_db

load_dotenv()

_raw_secret = (os.getenv("JWT_SECRET") or "").strip()
SECRET = _raw_secret if _raw_secret else "supersecretjwtkey1234567890abcdef"


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"User {user.id} has registered.")

    async def on_after_forgot_password(self, user: User, token: str, request: Optional[Request] = None):
        print(f"User {user.id} requested password reset. Token: {token}")

    async def on_after_request_verify(self, user: User, token: str, request: Optional[Request] = None):
        print(f"Verification requested for user {user.id}. Token: {token}")


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


from fastapi_users import exceptions
from fastapi_users.jwt import decode_jwt, generate_jwt
import jwt
from app.db import User, async_session_maker, get_user_db


class ServerlessJWTStrategy(JWTStrategy):
    """
    Enhanced JWTStrategy for Serverless environments (like Vercel).
    Automatically restores authenticated users across ephemeral serverless containers
    to prevent foreign key errors and 401 session-expired issues.
    """

    async def write_token(self, user: User) -> str:
        data = {
            "sub": str(user.id),
            "email": user.email,
            "aud": self.token_audience,
        }
        return generate_jwt(
            data, self.encode_key, self.lifetime_seconds, algorithm=self.algorithm
        )

    async def read_token(
        self, token: Optional[str], user_manager: BaseUserManager[User, uuid.UUID]
    ) -> Optional[User]:
        if token is None:
            return None

        try:
            data = decode_jwt(
                token, self.decode_key, self.token_audience, algorithms=[self.algorithm]
            )
            user_id = data.get("sub")
            email = data.get("email")
            if user_id is None:
                return None
        except jwt.PyJWTError:
            return None

        try:
            parsed_id = user_manager.parse_id(user_id)
            return await user_manager.get(parsed_id)
        except exceptions.UserNotExists:
            if email:
                try:
                    async with async_session_maker() as session:
                        restored_user = User(
                            id=parsed_id,
                            email=email,
                            hashed_password="oauth_hashed_placeholder",
                            is_active=True,
                            is_superuser=False,
                            is_verified=True,
                        )
                        session.add(restored_user)
                        await session.commit()
                    return await user_manager.get(parsed_id)
                except Exception as e:
                    print("Error auto-restoring serverless user:", e)
                    return None
            return None
        except exceptions.InvalidID:
            return None


def get_jwt_strategy() -> JWTStrategy:
    return ServerlessJWTStrategy(secret=SECRET, lifetime_seconds=86400)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
current_active_user = fastapi_users.current_user(active=True)

