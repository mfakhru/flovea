from fastapi import APIRouter, Depends, Request

from db import execute, fetch_all, fetch_one
from schemas import CategoryCreate, CategoryOut
from security import get_current_user

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    # usage_count rides along so callers can tell apart a category that is
    # actually in use from one nobody has spent on yet — the Riwayat filter
    # hides the latter, while the add/edit forms still offer every category.
    return await fetch_all(
        env.DB,
        "SELECT c.*, COUNT(e.id) AS usage_count FROM categories c "
        "LEFT JOIN expenses e ON e.category_id = c.id "
        "GROUP BY c.id ORDER BY c.name",
    )


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    meta = await execute(env.DB, "INSERT INTO categories (name) VALUES (?)", body.name)
    return await fetch_one(env.DB, "SELECT * FROM categories WHERE id = ?", meta["last_row_id"])
