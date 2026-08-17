from fastapi import APIRouter, Depends, HTTPException, Request, Response

from db import fetch_all, fetch_one
from schemas import LoginRequest, UserOut, UserSummary
from security import COOKIE_NAME, SESSION_MAX_AGE, create_token, get_current_user, verify_password

router = APIRouter()


@router.post("/auth/login", response_model=UserOut)
async def login(body: LoginRequest, request: Request, response: Response):
    env = request.scope["env"]
    user = await fetch_one(env.DB, "SELECT * FROM users WHERE username = ?", body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(
        {"sub": user["id"], "username": user["username"], "display_name": user["display_name"]},
        str(env.JWT_SECRET),
        SESSION_MAX_AGE,
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return {"id": user["id"], "username": user["username"], "display_name": user["display_name"]}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["sub"], "username": user["username"], "display_name": user["display_name"]}


@router.get("/users", response_model=list[UserSummary])
async def list_users(request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    return await fetch_all(env.DB, "SELECT id, display_name FROM users ORDER BY display_name")
