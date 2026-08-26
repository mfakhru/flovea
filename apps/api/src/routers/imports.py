import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile

from db import batch, execute, fetch_all
from schemas import ImportResult
from security import get_current_user

router = APIRouter()

REQUIRED_COLUMNS = {"date", "category", "detail", "amount", "notes", "user"}
# D1 is a network round-trip per call; batching keeps large imports (100s of
# rows) from doing one row-per-round-trip and blowing the Worker's CPU/wall
# time limit.
BATCH_SIZE = 50


@router.post("/import/csv", response_model=ImportResult)
async def import_csv(file: UploadFile, request: Request, user: dict = Depends(get_current_user)):
    env = request.scope["env"]
    raw = (await file.read()).decode("utf-8-sig")

    try:
        dialect = csv.Sniffer().sniff(raw[:4096], delimiters=",;\t")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","

    reader = csv.DictReader(io.StringIO(raw), delimiter=delimiter)

    if reader.fieldnames is None or not REQUIRED_COLUMNS.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must have columns: {', '.join(sorted(REQUIRED_COLUMNS))}",
        )

    users = {row["username"]: row["id"] for row in await fetch_all(env.DB, "SELECT id, username FROM users")}
    categories = {row["name"]: row["id"] for row in await fetch_all(env.DB, "SELECT id, name FROM categories")}

    errors = []
    valid_rows: list[tuple[int, tuple]] = []
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
            valid_rows.append((
                line_no,
                (
                    users[username],
                    categories[category_name],
                    row["date"],
                    row["detail"],
                    amount,
                    (row.get("notes") or None),
                    (row.get("pay_period") or None),
                ),
            ))
        except Exception as exc:
            errors.append({"row": line_no, "error": str(exc)})

    insert_sql = (
        "INSERT INTO expenses (user_id, category_id, expense_date, detail, amount, notes, pay_period) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)"
    )

    inserted = 0
    for chunk_start in range(0, len(valid_rows), BATCH_SIZE):
        chunk = valid_rows[chunk_start : chunk_start + BATCH_SIZE]
        statements = [env.DB.prepare(insert_sql).bind(*params) for _, params in chunk]
        try:
            await batch(env.DB, statements)
            inserted += len(chunk)
        except Exception as exc:
            for line_no, _ in chunk:
                errors.append({"row": line_no, "error": str(exc)})

    errors.sort(key=lambda e: e["row"])
    return {"inserted": inserted, "errors": errors}
