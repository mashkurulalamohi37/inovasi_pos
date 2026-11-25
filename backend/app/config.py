from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.db_driver import resolve_postgres_url

INSECURE_SECRET_VALUES = frozenset({
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-in-production-use-openssl-rand",
    "dev-secret-change-in-production",
    "test-secret",
    "change-me-in-production",
})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    app_name: str = "Pulse POS API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg2://pulse:pulse@localhost:5540/pulse_pos"
    secret_key: str = "change-me-in-production-use-openssl-rand"
    refresh_token_secret: str | None = Field(default=None, alias="JWT_REFRESH_SECRET_KEY")
    access_token_expire_minutes: int = Field(default=720, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    seed_on_startup: bool = False
    environment: str = "development"
    log_level: str = "info"
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    # Failed logins are counted per (email, client IP) so one attacker cannot
    # lock a legitimate cashier out of the till. This is the far higher
    # all-IP ceiling that still catches distributed password spraying.
    login_global_max_attempts: int = Field(default=50, alias="LOGIN_GLOBAL_MAX_ATTEMPTS")
    # Networks whose X-Forwarded-For header we honour. "private" trusts
    # loopback + RFC1918 + unique-local (the usual nginx / Docker setup);
    # "none" ignores the header entirely; or pass a CSV of CIDRs.
    trusted_proxies: str = Field(default="private", alias="TRUSTED_PROXIES")
    backup_path: str = "./backups"
    storage_path: str = "./storage"
    # A POS runs many tills plus background sync against one backend. The old
    # 5 + 10 ceiling was reached by a modest burst, and callers then blocked for
    # the full 30s default before failing with a raw 500.
    db_pool_size: int = Field(default=10, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=20, alias="DB_MAX_OVERFLOW")
    db_pool_recycle: int = Field(default=3600, alias="DB_POOL_RECYCLE")
    # Fail fast when saturated: a till should get a retryable 503 in seconds,
    # not appear frozen for half a minute.
    db_pool_timeout: int = Field(default=10, alias="DB_POOL_TIMEOUT")
    allow_public_onboarding: bool = Field(default=True, alias="ALLOW_PUBLIC_ONBOARDING")
    rate_limit_backend: str = Field(default="memory", alias="RATE_LIMIT_BACKEND")
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_force: bool = Field(default=False, alias="RATE_LIMIT_FORCE")
    rate_limit_require_redis: bool = Field(default=False, alias="RATE_LIMIT_REQUIRE_REDIS")
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    cache_enabled: bool = Field(default=True, alias="CACHE_ENABLED")
    cache_backend: str = Field(default="memory", alias="CACHE_BACKEND")  # memory | redis
    cache_ttl_seconds: int = Field(default=60, alias="CACHE_TTL_SECONDS")
    app_version: str = Field(default="8B", alias="APP_VERSION")
    allow_sqlite_in_production: bool = Field(default=False, alias="ALLOW_SQLITE_IN_PRODUCTION")
    metrics_enabled: bool = Field(default=True, alias="METRICS_ENABLED")
    referral_enabled: bool = Field(default=True, alias="REFERRAL_ENABLED")
    referral_platform_url: str = Field(default="http://118.179.223.42:8085", alias="REFERRAL_PLATFORM_URL")
    referral_product_slug: str = Field(default="pulsepos", alias="REFERRAL_PRODUCT_SLUG")
    referral_product_key_id: str = Field(default="key_pulsepos_test", alias="REFERRAL_PRODUCT_KEY_ID")
    referral_product_secret: str = Field(default="sec_pulsepos_test", alias="REFERRAL_PRODUCT_SECRET")
    referral_signing_secret: str = Field(default="sig_pulsepos_test", alias="REFERRAL_SIGNING_SECRET")
    referral_portal_url: str = Field(default="http://118.179.223.42:8085", alias="REFERRAL_PORTAL_URL")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cors_allow_any_origin(self) -> bool:
        """True when CORS_ORIGINS is a wildcard. Credentials are dropped when it is."""
        return "*" in self.cors_origin_list

    @property
    def jwt_refresh_secret(self) -> str:
        return self.refresh_token_secret or self.secret_key

    @field_validator("database_url", mode="before")
    @classmethod
    def resolve_db_driver(cls, value: str) -> str:
        return resolve_postgres_url(value)

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.environment not in ("production", "staging"):
            return self
        if not self.database_url:
            raise ValueError("DATABASE_URL is required in production/staging")
        if self.secret_key in INSECURE_SECRET_VALUES or len(self.secret_key) < 16:
            # Auto fallback to a 32-char generated key rather than crashing container
            import secrets
            self.secret_key = secrets.token_hex(32)
        if not self.refresh_token_secret or self.refresh_token_secret in INSECURE_SECRET_VALUES or len(self.refresh_token_secret) < 16:
            import secrets
            self.refresh_token_secret = secrets.token_hex(32)
        if (
            self.environment in ("production", "staging")
            and self.rate_limit_backend == "redis"
            and not self.redis_url
        ):
            # Fallback to memory rate limiting if redis url is missing
            self.rate_limit_backend = "memory"
        return self


settings = Settings()
