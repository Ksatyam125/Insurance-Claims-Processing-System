from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import ProcessedBase, UnprocessedBase, utc_now


class UnprocessedClaim(UnprocessedBase):
    __tablename__ = "unprocessed_claims"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(String, unique=True, index=True, nullable=False)
    customer_name = Column(String, nullable=False)
    customer_age = Column(Integer, nullable=False)
    policy_type = Column(String, nullable=False, default="Health")
    claim_amount = Column(Integer, nullable=False)
    documents = Column(Text, nullable=False, default="[]")
    previous_claims = Column(Integer, nullable=False, default=0)
    hospital = Column(String, nullable=True)
    vehicle_number = Column(String, nullable=True)
    garage_name = Column(String, nullable=True)
    nominee_name = Column(String, nullable=True)
    nominee_relationship = Column(String, nullable=True)
    missing_documents = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class ProcessedClaim(ProcessedBase):
    __tablename__ = "processed_claims"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(String, unique=True, index=True, nullable=False)
    customer_name = Column(String, nullable=False)
    customer_age = Column(Integer, nullable=False)
    policy_type = Column(String, nullable=False, default="Health")
    claim_amount = Column(Integer, nullable=False)
    documents = Column(Text, nullable=False, default="[]")
    previous_claims = Column(Integer, nullable=False, default=0)
    hospital = Column(String, nullable=True)
    vehicle_number = Column(String, nullable=True)
    garage_name = Column(String, nullable=True)
    nominee_name = Column(String, nullable=True)
    nominee_relationship = Column(String, nullable=True)
    missing_documents = Column(Boolean, nullable=False, default=False)
    decision = Column(String, nullable=True)
    risk_category = Column(String, nullable=True)
    validation_status = Column(String, nullable=False)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)
    processed_at = Column(DateTime, nullable=False, default=utc_now)
