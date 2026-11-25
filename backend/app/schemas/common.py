from __future__ import annotations

from typing import Annotated, Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

# ---------------------------------------------------------------------------
# Bounded numeric types for money and quantities.
#
# Unbounded floats reached the database and permanently broke the tenant: a
# product priced 1e308 sold at a negative quantity produced an invoice whose
# total was -inf, and every endpoint that serialised that row then returned 500
# ("Out of range float values are not JSON compliant"). There was no way to
# delete the row through the UI, because the list endpoint that would show it
# was itself one of the ones failing.
#
# The ceiling is far above any realistic POS transaction while staying in a
# range that JSON can represent, and allow_inf_nan=False rejects inf/nan at the
# API boundary instead of at JSON-encoding time.
# ---------------------------------------------------------------------------

MAX_MONEY = 1e12
MAX_QTY = 1e9

#: Currency amount: non-negative and finite.
Money = Annotated[float, Field(ge=0, le=MAX_MONEY, allow_inf_nan=False)]

#: Optional currency amount.
OptionalMoney = Optional[Money]

#: Sale/purchase line quantity: strictly positive and finite.
PositiveQty = Annotated[float, Field(gt=0, le=MAX_QTY, allow_inf_nan=False)]


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
