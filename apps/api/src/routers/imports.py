import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile

from db import execute, fetch_all
from schemas import ImportResult
from security import get_current_user

router = APIRouter()

REQUIRED_COLUMNS = {"date", "category", "detail", "amount", "notes", "user"}


@router.post("/import/csv", response_model=ImportResult)
async def import_csv(file: UploadFile, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))

    if reader.fieldnames is None or not REQUIRED_COLUMNS.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must have columns: {', '.join(sorted(REQUIRED_COLUMNS))}",
        )

    users = {row["username"]: row["id"] for row in await fetch_all(env.DB, "SELECT id, username FROM users")}
    categories = {row["name"]: row["id"] for row in await fetch_all(env.DB, "SELECT id, name FROM categories")}

    inserted = 0
    errors = []
    for line_no, row in enumerate(reader, start=2):  # header is line 1
        username = (row.get("user") or "").strip()
        category_name = (row.get("category") or "").strip()
        try:
            if username not in users:
                raise ValueError(f"unknown user '{username}'")

            if category_name not in categories:
                meta = await execute(env.DB, "INSERT INTO categories (name) VALUES (?)", category_name)
                categories[category_name] = meta["last_row_id"]

            amount = int(row["amount"])
            await execute(
                env.DB,
                "INSERT INTO expenses (user_id, category_id, expense_date, detail, amount, notes, pay_period) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                users[username],
                categories[category_name],
                row["date"],
                row["detail"],
                amount,
                (row.get("notes") or None),
                (row.get("pay_period") or None),
            )
            inserted += 1
        except Exception as exc:
            errors.append({"row": line_no, "error": str(exc)})

    return {"inserted": inserted, "errors": errors}
