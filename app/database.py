import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker


UNPROCESSED_DATABASE_URL = os.getenv("UNPROCESSED_DATABASE_URL", "sqlite:///./unprocessed_claims.db")
PROCESSED_DATABASE_URL = os.getenv("PROCESSED_DATABASE_URL", "sqlite:///./processed_claims.db")

unprocessed_engine = create_engine(
    UNPROCESSED_DATABASE_URL,
    connect_args={"check_same_thread": False} if UNPROCESSED_DATABASE_URL.startswith("sqlite") else {},
)
processed_engine = create_engine(
    PROCESSED_DATABASE_URL,
    connect_args={"check_same_thread": False} if PROCESSED_DATABASE_URL.startswith("sqlite") else {},
)

UnprocessedSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=unprocessed_engine)
ProcessedSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=processed_engine)

UnprocessedBase = declarative_base()
ProcessedBase = declarative_base()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_all_tables() -> None:
    from app.models import ProcessedClaim, UnprocessedClaim  # local import to avoid circular import

    UnprocessedBase.metadata.create_all(bind=unprocessed_engine)
    ProcessedBase.metadata.create_all(bind=processed_engine)
    _migrate_sqlite_columns(
        unprocessed_engine,
        "unprocessed_claims",
        {
            "vehicle_number": "VARCHAR",
            "garage_name": "VARCHAR",
            "nominee_name": "VARCHAR",
            "nominee_relationship": "VARCHAR",
        },
    )
    _migrate_sqlite_columns(
        processed_engine,
        "processed_claims",
        {
            "vehicle_number": "VARCHAR",
            "garage_name": "VARCHAR",
            "nominee_name": "VARCHAR",
            "nominee_relationship": "VARCHAR",
        },
    )


def _migrate_sqlite_columns(engine, table_name: str, columns: dict[str, str]) -> None:
    if not engine.url.get_backend_name().startswith("sqlite"):
        return

    inspector = inspect(engine)
    if not inspector.has_table(table_name):
        return

    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    with engine.begin() as connection:
        for column_name, column_type in columns.items():
            if column_name not in existing_columns:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
