"""Small helpers around the D1 binding's prepare/bind/all/run JS API.

The `workers` package's env wrapper already converts D1's JS results into
native Python dicts/lists (a JsDict, not a JsProxy) before they reach here,
so no `.to_py()` call is needed — or possible — on values returned from
`.all()`/`.run()`.
"""


async def fetch_all(db, sql, *params):
    stmt = db.prepare(sql)
    if params:
        stmt = stmt.bind(*params)
    result = await stmt.all()
    return result.results


async def fetch_one(db, sql, *params):
    rows = await fetch_all(db, sql, *params)
    return rows[0] if rows else None


async def execute(db, sql, *params):
    stmt = db.prepare(sql)
    if params:
        stmt = stmt.bind(*params)
    result = await stmt.run()
    return result.meta


async def batch(db, statements):
    """Run multiple already-bound prepared statements in a single D1 round-trip."""
    return await db.batch(statements)
