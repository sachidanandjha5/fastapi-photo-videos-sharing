from datetime import datetime
import os
from typing import Optional
import uuid

from dotenv import load_dotenv
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, exceptions
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


def get_deterministic_user_id(email: str) -> uuid.UUID:
    """
    Deterministically maps an email to a UUID using UUIDv5.
    Ensures the same Google account always gets the exact same user UUID
    across all devices, browser sessions, and serverless containers.
    """
    normalized_email = email.strip().lower()
    return uuid.uuid5(uuid.NAMESPACE_URL, f"mailto:{normalized_email}")


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    async def create(
        self,
        user_create,
        safe: bool = False,
        request: Optional[Request] = None,
    ) -> User:
        await self.validate_password(user_create.password, user_create)

        existing_user = await self.user_db.get_by_email(user_create.email)
        if existing_user is not None:
            raise exceptions.UserAlreadyExists()

        user_dict = (
            user_create.create_update_dict()
            if safe
            else user_create.create_update_dict_superuser()
        )
        password = user_dict.pop("password")
        user_dict["hashed_password"] = self.password_helper.hash(password)
        user_dict["id"] = get_deterministic_user_id(user_create.email)

        created_user = await self.user_db.create(user_dict)
        await self.on_after_register(created_user, request)
        return created_user

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
            effective_id = get_deterministic_user_id(email) if email else parsed_id
            fallback_email = email or f"user_{str(effective_id)[:8]}@sharecare.com"
            try:
                async with async_session_maker() as session:
                    restored_user = User(
                        id=effective_id,
                        email=fallback_email,
                        hashed_password="oauth_hashed_placeholder",
                        is_active=True,
                        is_superuser=False,
                        is_verified=True,
                    )
                    session.add(restored_user)
                    await session.commit()
                return await user_manager.get(effective_id)
            except Exception as e:
                print("Error auto-restoring serverless user:", e)
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

