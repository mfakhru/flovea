from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str


class UserSummary(BaseModel):
    id: int
    display_name: str


class CategoryOut(BaseModel):
    id: int
    name: str
    is_default: bool


class CategoryCreate(BaseModel):
    name: str


class ExpenseCreate(BaseModel):
    category_id: int
    expense_date: str  # ISO date (YYYY-MM-DD)
    detail: str
    amount: int  # IDR, whole rupiah, no decimals
    notes: str | None = None
    needs_reimburse: bool = False
    pay_period: str | None = None  # YYYY-MM, the salary period this expense belongs to


class ExpenseOut(BaseModel):
    id: int
    user_id: int
    category_id: int
    expense_date: str
    detail: str
    amount: int
    notes: str | None = None
    needs_reimburse: bool
    reimbursed_at: str | None = None
    pay_period: str | None = None
    created_at: str


class UserTotal(BaseModel):
    user_id: int
    display_name: str
    total: int


class ExpenseSummary(BaseModel):
    by_user: list[UserTotal]
    pending_reimburse: int


class ImportError(BaseModel):
    row: int
    error: str


class ImportResult(BaseModel):
    inserted: int
    errors: list[ImportError]
