from fastapi import APIRouter, Depends, Request

from db import execute, fetch_all, fetch_one
from schemas import CategoryCreate, CategoryOut
from security import get_current_user

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    return await fetch_all(env.DB, "SELECT * FROM categories ORDER BY name")


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    meta = await execute(env.DB, "INSERT INTO categories (name) VALUES (?)", body.name)
    return await fetch_one(env.DB, "SELECT * FROM categories WHERE id = ?", meta["last_row_id"])
