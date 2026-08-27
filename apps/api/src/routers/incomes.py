from fastapi import APIRouter, Depends, HTTPException, Request

from db import execute, fetch_all, fetch_one
from schemas import IncomeOut, IncomeUpsert
from security import get_current_user

router = APIRouter()


@router.get("/incomes", response_model=list[IncomeOut])
async def list_incomes(request: Request, user: dict = Depends(get_current_user)):
    """Every recorded period, newest first — the Home trend chart pairs these
    against /expenses/by-period."""
    env = request.scope["env"]
    return await fetch_all(
        env.DB, "SELECT pay_period, amount FROM incomes ORDER BY pay_period DESC"
    )


@router.get("/incomes/{pay_period}", response_model=IncomeOut)
async def get_income(pay_period: str, request: Request, user: dict = Depends(get_current_user)):
    """A period with no income recorded yet reports 0 rather than 404 — the
    caller wants "nothing entered", not an error."""
    env = request.scope["env"]
    row = await fetch_one(
        env.DB, "SELECT pay_period, amount FROM incomes WHERE pay_period = ?", pay_period
    )
    return row or {"pay_period": pay_period, "amount": 0}


@router.put("/incomes/{pay_period}", response_model=IncomeOut)
async def set_income(
    pay_period: str, body: IncomeUpsert, request: Request, user: dict = Depends(get_current_user)
):
    """Upsert — income is corrected in place rather than accumulated, so
    saving twice for the same period overwrites instead of doubling."""
    env = request.scope["env"]
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="Pemasukan tidak boleh negatif")

    await execute(
        env.DB,
        "INSERT INTO incomes (pay_period, amount, updated_at) VALUES (?, ?, datetime('now')) "
        "ON CONFLICT(pay_period) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at",
        pay_period,
        body.amount,
    )
    return await fetch_one(
        env.DB, "SELECT pay_period, amount FROM incomes WHERE pay_period = ?", pay_period
    )
