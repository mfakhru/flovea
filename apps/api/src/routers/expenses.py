from fastapi import APIRouter, Depends, HTTPException, Request

from db import execute, fetch_all, fetch_one
from schemas import CategoryTotal, ExpenseCreate, ExpenseOut, ExpenseSummary, PeriodTotal
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
    pay_period: str | None = None,
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
    if pay_period:
        clauses.append("pay_period = ?")
        params.append(pay_period)

    return clauses, params


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    request: Request,
    year: int | None = None,
    month: int | None = None,
    user_id: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    pay_period: str | None = None,
    sort: str = "desc",
    page: int = 1,
    user: dict = Depends(get_current_user),
):
    env = request.scope["env"]
    clauses, params = _build_filters(year, month, category_id, q, pay_period)
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
    pay_period: str | None = None,
    user: dict = Depends(get_current_user),
):
    env = request.scope["env"]
    clauses, params = _build_filters(year, month, category_id, q, pay_period)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    users = await fetch_all(env.DB, "SELECT id, display_name FROM users ORDER BY id")
    # Once reimbursed, the amount is attributed to whoever paid it back
    # (reimbursed_by), not the original recorder (user_id) — that's who it
    # actually ended up costing.
    totals_rows = await fetch_all(
        env.DB,
        f"SELECT COALESCE(reimbursed_by, user_id) AS user_id, COALESCE(SUM(amount), 0) AS total "
        f"FROM expenses {where} GROUP BY COALESCE(reimbursed_by, user_id)",
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


@router.get("/expenses/by-category", response_model=list[CategoryTotal])
async def get_expenses_by_category(
    request: Request,
    year: int | None = None,
    month: int | None = None,
    q: str | None = None,
    pay_period: str | None = None,
    user: dict = Depends(get_current_user),
):
    env = request.scope["env"]
    clauses, params = _build_filters(year, month, None, q, pay_period)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    categories = await fetch_all(env.DB, "SELECT id, name FROM categories ORDER BY id")
    totals_rows = await fetch_all(
        env.DB,
        f"SELECT category_id, COALESCE(SUM(amount), 0) AS total FROM expenses {where} GROUP BY category_id",
        *params,
    )
    totals_by_cat = {row["category_id"]: row["total"] for row in totals_rows}

    result = [
        {"category_id": c["id"], "category_name": c["name"], "total": totals_by_cat.get(c["id"], 0)}
        for c in categories
        if totals_by_cat.get(c["id"], 0) > 0
    ]
    result.sort(key=lambda r: r["total"], reverse=True)
    return result


@router.get("/expenses/by-period", response_model=list[PeriodTotal])
async def get_expenses_by_period(
    request: Request, limit: int = 12, user: dict = Depends(get_current_user)
):
    env = request.scope["env"]
    users = await fetch_all(env.DB, "SELECT id, display_name FROM users ORDER BY id")
    rows = await fetch_all(
        env.DB,
        "SELECT pay_period, COALESCE(reimbursed_by, user_id) AS user_id, "
        "COALESCE(SUM(amount), 0) AS total FROM expenses "
        "WHERE pay_period IS NOT NULL GROUP BY pay_period, COALESCE(reimbursed_by, user_id)",
    )

    totals_by_period: dict[str, dict[int, int]] = {}
    for row in rows:
        totals_by_period.setdefault(row["pay_period"], {})[row["user_id"]] = row["total"]

    periods = sorted(totals_by_period.keys(), reverse=True)[:limit]
    periods.reverse()

    result = []
    for period in periods:
        user_totals = totals_by_period[period]
        by_user = [
            {"user_id": u["id"], "display_name": u["display_name"], "total": user_totals.get(u["id"], 0)}
            for u in users
        ]
        result.append({"pay_period": period, "by_user": by_user, "total": sum(user_totals.values())})
    return result


@router.get("/expenses/pay-periods", response_model=list[str])
async def list_pay_periods(request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    rows = await fetch_all(
        env.DB,
        "SELECT DISTINCT pay_period FROM expenses WHERE pay_period IS NOT NULL ORDER BY pay_period DESC",
    )
    return [row["pay_period"] for row in rows]


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
        "INSERT INTO expenses (user_id, category_id, expense_date, detail, amount, notes, needs_reimburse, pay_period) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        user["sub"],
        body.category_id,
        body.expense_date,
        body.detail,
        body.amount,
        body.notes,
        int(body.needs_reimburse),
        body.pay_period,
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
    reimbursed_by = existing["reimbursed_by"] if body.needs_reimburse else None
    await execute(
        env.DB,
        "UPDATE expenses SET category_id = ?, expense_date = ?, detail = ?, amount = ?, notes = ?, "
        "needs_reimburse = ?, reimbursed_at = ?, reimbursed_by = ?, pay_period = ? WHERE id = ?",
        body.category_id,
        body.expense_date,
        body.detail,
        body.amount,
        body.notes,
        int(body.needs_reimburse),
        reimbursed_at,
        reimbursed_by,
        body.pay_period,
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
        "UPDATE expenses SET "
        "reimbursed_at = CASE WHEN reimbursed_at IS NULL THEN datetime('now') ELSE NULL END, "
        "reimbursed_by = CASE WHEN reimbursed_at IS NULL THEN ? ELSE NULL END "
        "WHERE id = ?",
        user["sub"],
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
