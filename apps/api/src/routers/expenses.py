from fastapi import APIRouter, Depends, HTTPException, Request

from db import execute, fetch_all, fetch_one
from schemas import ExpenseCreate, ExpenseOut, ExpenseSummary
from security import get_current_user

router = APIRouter()

PAGE_SIZE = 50

# Reimbursement only flows one way: Suami pays, Istri reimburses. Only
# expenses owned by the "Suami" account may be flagged needs_reimburse.
SUAMI_DISPLAY_NAME = "Suami"


def _date_range_clause(year: int | None, month: int | None) -> tuple[str, list] | None:
    if year is None:
        return None
    if month is not None:
        start = f"{year:04d}-{month:02d}-01"
        end_year, end_month = (year + 1, 1) if month == 12 else (year, month + 1)
    else:
        start = f"{year:04d}-01-01"
        end_year, end_month = year + 1, 1
    end = f"{end_year:04d}-{end_month:02d}-01"
    return "expense_date >= ? AND expense_date < ?", [start, end]


def _build_filters(
    year: int | None,
    month: int | None,
    category_id: int | None,
    q: str | None,
) -> tuple[list[str], list]:
    clauses: list[str] = []
    params: list = []

    date_clause = _date_range_clause(year, month)
    if date_clause:
        clause, clause_params = date_clause
        clauses.append(clause)
        params.extend(clause_params)
    if category_id is not None:
        clauses.append("category_id = ?")
        params.append(category_id)
    if q:
        clauses.append("(detail LIKE ? OR notes LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])

    return clauses, params


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    request: Request,
    year: int | None = None,
    month: int | None = None,
    user_id: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    sort: str = "desc",
    page: int = 1,
    user: dict = Depends(get_current_user),
):
    env = request.scope["env"]
    clauses, params = _build_filters(year, month, category_id, q)
    if user_id is not None:
        clauses.append("user_id = ?")
        params.append(user_id)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    order = "ASC" if sort == "asc" else "DESC"
    offset = max(page - 1, 0) * PAGE_SIZE
    sql = (
        f"SELECT * FROM expenses {where} "
        f"ORDER BY expense_date {order}, id {order} LIMIT ? OFFSET ?"
    )
    return await fetch_all(env.DB, sql, *params, PAGE_SIZE, offset)


@router.get("/expenses/summary", response_model=ExpenseSummary)
async def get_expenses_summary(
    request: Request,
    year: int | None = None,
    month: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    user: dict = Depends(get_current_user),
):
    env = request.scope["env"]
    clauses, params = _build_filters(year, month, category_id, q)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    users = await fetch_all(env.DB, "SELECT id, display_name FROM users ORDER BY id")
    totals_rows = await fetch_all(
        env.DB,
        f"SELECT user_id, COALESCE(SUM(amount), 0) AS total FROM expenses {where} GROUP BY user_id",
        *params,
    )
    totals_by_user = {row["user_id"]: row["total"] for row in totals_rows}

    pending_clauses = [*clauses, "needs_reimburse = 1", "reimbursed_at IS NULL"]
    pending_where = f"WHERE {' AND '.join(pending_clauses)}"
    pending_row = await fetch_one(
        env.DB,
        f"SELECT COALESCE(SUM(amount), 0) AS total FROM expenses {pending_where}",
        *params,
    )

    by_user = [
        {"user_id": u["id"], "display_name": u["display_name"], "total": totals_by_user.get(u["id"], 0)}
        for u in users
    ]
    return {
        "by_user": by_user,
        "pending_reimburse": pending_row["total"] if pending_row else 0,
    }


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
    if body.needs_reimburse and user["display_name"] != SUAMI_DISPLAY_NAME:
        raise HTTPException(status_code=400, detail="Hanya pengeluaran Suami yang bisa direimburse")

    meta = await execute(
        env.DB,
        "INSERT INTO expenses (user_id, category_id, expense_date, detail, amount, notes, needs_reimburse) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        user["sub"],
        body.category_id,
        body.expense_date,
        body.detail,
        body.amount,
        body.notes,
        int(body.needs_reimburse),
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

    if body.needs_reimburse:
        owner = await fetch_one(env.DB, "SELECT display_name FROM users WHERE id = ?", existing["user_id"])
        if not owner or owner["display_name"] != SUAMI_DISPLAY_NAME:
            raise HTTPException(status_code=400, detail="Hanya pengeluaran Suami yang bisa direimburse")

    # if reimbursement is no longer needed, any prior "paid" mark is stale — clear it
    reimbursed_at = existing["reimbursed_at"] if body.needs_reimburse else None
    await execute(
        env.DB,
        "UPDATE expenses SET category_id = ?, expense_date = ?, detail = ?, amount = ?, notes = ?, "
        "needs_reimburse = ?, reimbursed_at = ? WHERE id = ?",
        body.category_id,
        body.expense_date,
        body.detail,
        body.amount,
        body.notes,
        int(body.needs_reimburse),
        reimbursed_at,
        expense_id,
    )
    return await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)


@router.post("/expenses/{expense_id}/reimburse", response_model=ExpenseOut)
async def toggle_reimburse(expense_id: int, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    existing = await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    if not existing["needs_reimburse"]:
        raise HTTPException(status_code=400, detail="Expense is not marked for reimbursement")

    await execute(
        env.DB,
        "UPDATE expenses SET reimbursed_at = CASE WHEN reimbursed_at IS NULL "
        "THEN datetime('now') ELSE NULL END WHERE id = ?",
        expense_id,
    )
    return await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(expense_id: int, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    existing = await fetch_one(env.DB, "SELECT * FROM expenses WHERE id = ?", expense_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    await execute(env.DB, "DELETE FROM expenses WHERE id = ?", expense_id)
