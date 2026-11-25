"""Report export job tracking + custom report definitions."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class ReportExport(TimestampMixin, table=True):
    __tablename__ = "report_export"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    report_key: str = Field(index=True)
    format: str = "csv"
    status: str = "completed"  # completed, failed
    row_count: int = 0
    filters_json: Optional[str] = None
    created_by: Optional[str] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class CustomReport(TimestampMixin, table=True):
    """User-built report definition shared across the company."""

    __tablename__ = "custom_report"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    title: str
    source_key: str = Field(index=True)
    # JSON array of column codes in display order
    columns_json: str = "[]"
    # Optional JSON map { code: label override }
    column_labels_json: Optional[str] = None
    # Optional default filters JSON (excluding dates)
    default_filters_json: Optional[str] = None
    status: str = "active"  # active, archived
    created_by: Optional[str] = Field(default=None, foreign_key="user_account.id")
    updated_by: Optional[str] = Field(default=None, foreign_key="user_account.id")
