from fastapi import FastAPI, Request

from routers import auth, categories, expenses, imports

app = FastAPI()

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(expenses.router)
app.include_router(imports.router)


@app.get("/health")
async def health(request: Request):
    env = request.scope["env"]
    results = await env.DB.prepare("SELECT 1 AS ok").all()
    row = results.results[0].to_py()
    return {"status": "ok", "d1": dict(row)}
