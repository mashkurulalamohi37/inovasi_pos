"""Inventory domain exceptions."""


class InsufficientStockError(Exception):
    def __init__(
        self,
        product_id: str,
        requested: float,
        available: float,
        store_id: str | None = None,
    ) -> None:
        self.product_id = product_id
        self.requested = requested
        self.available = available
        self.store_id = store_id
        super().__init__(
            f"Insufficient stock for product {product_id}: requested {requested}, available {available}"
        )
