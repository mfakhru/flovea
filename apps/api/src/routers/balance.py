"""Saldo Istri — a running balance carried across pay periods indefinitely.

Nothing here stores a balance. Every response recomputes the whole ledger
from its three inputs (incomes.istri_amount, Istri's expenses, and the
balance_adjustments corrections) on top of a saved opening balance, so
editing a months-old expense corrects every later period for free. For two
users and a few hundred rows that is three GROUP BY queries — cheaper than
keeping snapshots honest.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from db import execute, fetch_all, fetch_one
from routers.expenses import (
    NOT_SPECIAL_CASE_CLAUSE,
    SPECIAL_CASE_PREFIX,
    get_istri_id,
)
from schemas import AdjustmentCreate, BalanceRecap, OpeningBalanceUpsert
from security import get_current_user

router = APIRouter()

OPENING_BALANCE_KEY = "istri_opening_balance"


def _valid_period(period: str) -> bool:
    """YYYY-MM, the same shape expenses.pay_period uses."""
    if len(period) != 7 or period[4] != "-":
        return False
    year, month = period[:4], period[5:]
    return year.isdigit() and month.isdigit() and 1 <= int(month) <= 12


async def _opening_balance(env) -> int:
    row = await fetch_one(
        env.DB, "SELECT value FROM app_settings WHERE key = ?", OPENING_BALANCE_KEY
    )
    if not row:
        return 0
    try:
        return int(row["value"])
    except (TypeError, ValueError):
        # A hand-edited settings row shouldn't take the whole page down; a
        # wrong-looking balance is recoverable, a 500 on Saldo isn't.
        return 0


async def _recap(env) -> dict:
    istri_id = await get_istri_id(env)

    # What actually ended up costing Istri: her own expenses plus any of
    # Suami's she has marked lunas. COALESCE(reimbursed_by, user_id) is the
    # same attribution /expenses/summary uses, so the ledger and the Riwayat
    # totals can never disagree. "A_" rows live in their own bucket there and
    # are left out here for the same reason.
    spend_rows = await fetch_all(
        env.DB,
        "SELECT pay_period, COALESCE(SUM(amount), 0) AS total FROM expenses "
        f"WHERE pay_period IS NOT NULL AND {NOT_SPECIAL_CASE_CLAUSE} "
        "AND COALESCE(reimbursed_by, user_id) = ? GROUP BY pay_period",
        SPECIAL_CASE_PREFIX,
        SPECIAL_CASE_PREFIX,
        istri_id,
    )
    income_rows = await fetch_all(env.DB, "SELECT pay_period, istri_amount FROM incomes")
    adjustment_rows = await fetch_all(
        env.DB,
        "SELECT * FROM balance_adjustments ORDER BY pay_period DESC, id DESC",
    )
    pending_row = await fetch_one(
        env.DB,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total FROM expenses "
        f"WHERE {NOT_SPECIAL_CASE_CLAUSE} AND needs_reimburse = 1 AND reimbursed_at IS NULL",
        SPECIAL_CASE_PREFIX,
        SPECIAL_CASE_PREFIX,
    )

    spent_by = {row["pay_period"]: row["total"] for row in spend_rows}
    received_by = {row["pay_period"]: row["istri_amount"] for row in income_rows}
    adjusted_by: dict[str, int] = {}
    for row in adjustment_rows:
        adjusted_by[row["pay_period"]] = adjusted_by.get(row["pay_period"], 0) + row["amount"]

    # Every period the household has any record of, not just the ones with
    # Istri activity — a month she neither received nor spent in still gets a
    # row so the ledger reads as an unbroken run of months rather than a list
    # with holes in it.
    periods = sorted(
        {row["pay_period"] for row in spend_rows}
        | {row["pay_period"] for row in income_rows}
        | set(adjusted_by)
    )

    opening = await _opening_balance(env)
    balance = opening
    rows = []
    for period in periods:
        received = received_by.get(period, 0)
        spent = spent_by.get(period, 0)
        adjustment = adjusted_by.get(period, 0)
        net = received - spent + adjustment
        balance += net
        rows.append(
            {
                "pay_period": period,
                "received": received,
                "spent": spent,
                "adjustment": adjustment,
                "net": net,
                "closing_balance": balance,
            }
        )
    rows.reverse()

    return {
        "opening_balance": opening,
        "current_balance": balance,
        "pending_reimburse": pending_row["total"] if pending_row else 0,
        "pending_count": pending_row["cnt"] if pending_row else 0,
        "rows": rows,
        "adjustments": adjustment_rows,
    }


@router.get("/balance", response_model=BalanceRecap)
async def get_balance(request: Request, user: dict = Depends(get_current_user)):
    return await _recap(request.scope["env"])


@router.put("/balance/opening", response_model=BalanceRecap)
async def set_opening_balance(
    body: OpeningBalanceUpsert, request: Request, user: dict = Depends(get_current_user)
):
    """Saldo before the first recorded period. Mutations return the whole
    recomputed recap rather than just the saved value — every figure on the
    page moves when this changes, so re-reading it would be a second
    round-trip for data we already have in hand."""
    env = request.scope["env"]
    await execute(
        env.DB,
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        OPENING_BALANCE_KEY,
        str(body.amount),
    )
    return await _recap(env)


@router.post("/balance/adjustments", response_model=BalanceRecap, status_code=201)
async def create_adjustment(
    body: AdjustmentCreate, request: Request, user: dict = Depends(get_current_user)
):
    env = request.scope["env"]
    if not _valid_period(body.pay_period):
        raise HTTPException(status_code=400, detail="Periode tidak valid")
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="Nominal koreksi tidak boleh nol")
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Keterangan koreksi wajib diisi")

    await execute(
        env.DB,
        "INSERT INTO balance_adjustments (pay_period, amount, note) VALUES (?, ?, ?)",
        body.pay_period,
        body.amount,
        note,
    )
    return await _recap(env)


@router.delete("/balance/adjustments/{adjustment_id}", response_model=BalanceRecap)
async def delete_adjustment(
    adjustment_id: int, request: Request, user: dict = Depends(get_current_user)
):
    env = request.scope["env"]
    existing = await fetch_one(
        env.DB, "SELECT id FROM balance_adjustments WHERE id = ?", adjustment_id
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Koreksi tidak ditemukan")
    await execute(env.DB, "DELETE FROM balance_adjustments WHERE id = ?", adjustment_id)
    return await _recap(env)
