from fastapi import APIRouter, Depends, HTTPException, Request

from db import execute, fetch_all, fetch_one
from schemas import ExpenseCreate, ExpenseOut
from security import get_current_user

router = APIRouter()

PAGE_SIZE = 50


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    request: Request,
    year: int | None = None,
    month: int | None = None,
    user_id: int | None = None,
    category_id: int | None = None,
    page: int = 1,
    user: dict = Depends(get_current_user),
):
    env = request.scope["env"]
    clauses = []
    params: list = []

    if year is not None:
        if month is not None:
            start = f"{year:04d}-{month:02d}-01"
            end_year, end_month = (year + 1, 1) if month == 12 else (year, month + 1)
        else:
            start = f"{year:04d}-01-01"
            end_year, end_month = year + 1, 1
        end = f"{end_year:04d}-{end_month:02d}-01"
        clauses.append("expense_date >= ? AND expense_date < ?")
        params.extend([start, end])
    if user_id is not None:
        clauses.append("user_id = ?")
        params.append(user_id)
    if category_id is not None:
        clauses.append("category_id = ?")
        params.append(category_id)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    offset = max(page - 1, 0) * PAGE_SIZE
    sql = f"SELECT * FROM expenses {where} ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?"
    return await fetch_all(env.DB, sql, *params, PAGE_SIZE, offset)


@router.get("/expenses/{expense_id}", response_model=ExpenseOut)
async def get_expense(expense_id: int, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    row = await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    return row


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
async def create_expense(body: ExpenseCreate, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    meta = await execute(
        env.DB,
        "INSERT INTO expenses (user_id, category_id, expense_date, detail, amount, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        user["sub"], body.category_id, body.expense_date, body.detail, body.amount, body.notes,
    )
    return await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", meta["last_row_id"])


@router.put("/expenses/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: int, body: ExpenseCreate, request: Request, user: dict = Depends(get_current_user)
):
    env = request.scope["env"]
    existing = await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")

    await execute(
        env.DB,
        "UPDATE expenses SET category_id = ?, expense_date = ?, detail = ?, amount = ?, notes = ? WHERE id = ?",
        body.category_id, body.expense_date, body.detail, body.amount, body.notes, expense_id,
    )
    return await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(expense_id: int, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    existing = await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    await execute(env.DB, "DELETE FROM expenses WHERE id = ?", expense_id)
