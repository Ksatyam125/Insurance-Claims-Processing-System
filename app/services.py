import json
import logging
from secrets import token_hex
from typing import Optional, Union

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import ProcessedClaim, UnprocessedClaim
from app.schemas import ClaimSubmit, ClaimUpdate


logger = logging.getLogger("claims_app")

ALLOWED_HOSPITALS = {"City Care Hospital", "Apollo Hospital", "Global Hospital"}
ALLOWED_POLICY_TYPES = {"Health", "Motor", "Life"}
REQUIRED_DOC_KEYWORDS = {
    "Health": ["invoice", "health_card"],
    "Motor": ["invoice", "rc"],
    "Life": ["invoice", "id_proof"],
}


def generate_claim_id(unprocessed_db: Session, processed_db: Session) -> str:
    while True:
        claim_id = f"CLM{token_hex(4).upper()}"
        exists_unprocessed = unprocessed_db.query(UnprocessedClaim).filter(UnprocessedClaim.claim_id == claim_id).first()
        exists_processed = processed_db.query(ProcessedClaim).filter(ProcessedClaim.claim_id == claim_id).first()
        if not exists_unprocessed and not exists_processed:
            return claim_id


def validate_claim(claim: Union[ClaimSubmit, ClaimUpdate]) -> list[str]:
    errors: list[str] = []

    if not claim.customer_name.strip():
        errors.append("Customer Name is required")

    if claim.customer_age < 18 or claim.customer_age > 100:
        errors.append("Customer Age must be between 18 and 100")

    if claim.policy_type not in ALLOWED_POLICY_TYPES:
        errors.append("Policy Type must be Health, Motor, or Life")

    if claim.claim_amount <= 0:
        errors.append("Claim Amount must be greater than zero")

    if not claim.documents:
        errors.append("Documents list must not be empty")

    if claim.previous_claims < 0:
        errors.append("Previous Claims cannot be negative")

    if claim.policy_type == "Health" and not (claim.hospital or "").strip():
        errors.append("Hospital is required for Health claims")

    if claim.policy_type == "Motor" and not (claim.vehicle_number or "").strip():
        errors.append("Vehicle Number is required for Motor claims")

    if claim.policy_type == "Life" and not (claim.nominee_name or "").strip():
        errors.append("Nominee Name is required for Life claims")

    return errors


def determine_decision(claim: Union[ClaimSubmit, ClaimUpdate]) -> str:
    if claim.claim_amount > 100000 and claim.previous_claims > 5:
        return "Rejected"
    if claim.missing_documents:
        return "Need Review"
    if claim.policy_type == "Health" and (not claim.hospital or claim.hospital not in ALLOWED_HOSPITALS):
        return "Manual Verification"
    if claim.customer_age > 70 and claim.claim_amount > 50_000:
        return "Senior Review"
    return "Approved"


def calculate_risk_score(claim: Union[ClaimSubmit, ClaimUpdate]) -> tuple[int, str]:
    if 18 <= claim.customer_age <= 30:
        age_score = 10
    elif 31 <= claim.customer_age <= 60:
        age_score = 20
    else:
        age_score = 40

    if claim.claim_amount <= 10_000:
        amount_score = 5
    elif claim.claim_amount <= 50_000:
        amount_score = 15
    else:
        amount_score = 30

    if claim.previous_claims == 0:
        previous_score = 0
    elif claim.previous_claims <= 2:
        previous_score = 10
    else:
        previous_score = 30

    total = age_score + amount_score + previous_score
    if total <= 30:
        category = "Low"
    elif total <= 60:
        category = "Medium"
    else:
        category = "High"

    return total, category


def _to_json_documents(documents: list[str]) -> str:
    return json.dumps(documents)


def _build_unprocessed_model(claim: ClaimSubmit) -> UnprocessedClaim:
    return UnprocessedClaim(
        claim_id=claim.claim_id,
        customer_name=claim.customer_name,
        customer_age=claim.customer_age,
        policy_type=claim.policy_type,
        claim_amount=claim.claim_amount,
        documents=_to_json_documents(claim.documents),
        previous_claims=claim.previous_claims,
        hospital=claim.hospital,
        vehicle_number=claim.vehicle_number,
        garage_name=claim.garage_name,
        nominee_name=claim.nominee_name,
        nominee_relationship=claim.nominee_relationship,
        missing_documents=claim.missing_documents,
    )


def _build_processed_model(claim: Union[ClaimSubmit, ClaimUpdate], claim_id: str) -> ProcessedClaim:
    claim = _ensure_missing_documents(claim)
    errors = validate_claim(claim)
    if errors:
        remarks = "; ".join(errors)
        return ProcessedClaim(
            claim_id=claim_id,
            customer_name=claim.customer_name,
            customer_age=claim.customer_age,
            policy_type=claim.policy_type,
            claim_amount=claim.claim_amount,
            documents=_to_json_documents(claim.documents),
            previous_claims=claim.previous_claims,
            hospital=claim.hospital,
            vehicle_number=claim.vehicle_number,
            garage_name=claim.garage_name,
            nominee_name=claim.nominee_name,
            nominee_relationship=claim.nominee_relationship,
            missing_documents=claim.missing_documents,
            decision=None,
            risk_category=None,
            validation_status="Failed",
            remarks=remarks,
        )

    decision = determine_decision(claim)
    score, risk_category = calculate_risk_score(claim)
    remarks = f"Decision: {decision}; Risk score: {score}"
    return ProcessedClaim(
        claim_id=claim_id,
        customer_name=claim.customer_name,
        customer_age=claim.customer_age,
        policy_type=claim.policy_type,
        claim_amount=claim.claim_amount,
        documents=_to_json_documents(claim.documents),
        previous_claims=claim.previous_claims,
        hospital=claim.hospital,
        vehicle_number=claim.vehicle_number,
        garage_name=claim.garage_name,
        nominee_name=claim.nominee_name,
        nominee_relationship=claim.nominee_relationship,
        missing_documents=claim.missing_documents,
        decision=decision,
        risk_category=risk_category,
        validation_status="Passed",
        remarks=remarks,
    )


def _serialize_unprocessed(claim: UnprocessedClaim) -> dict:
    return {
        "claim_id": claim.claim_id,
        "customer_name": claim.customer_name,
        "customer_age": claim.customer_age,
        "policy_type": claim.policy_type,
        "claim_amount": claim.claim_amount,
        "documents": json.loads(claim.documents or "[]"),
        "previous_claims": claim.previous_claims,
        "hospital": claim.hospital,
        "vehicle_number": claim.vehicle_number,
        "garage_name": claim.garage_name,
        "nominee_name": claim.nominee_name,
        "nominee_relationship": claim.nominee_relationship,
        "missing_documents": bool(claim.missing_documents),
        "created_at": claim.created_at.isoformat(),
        "updated_at": claim.updated_at.isoformat(),
    }


def _serialize_processed(claim: ProcessedClaim) -> dict:
    payload = _serialize_unprocessed(claim)  # type: ignore[arg-type]
    payload.update(
        {
            "decision": claim.decision,
            "risk_category": claim.risk_category,
            "validation_status": claim.validation_status,
            "remarks": claim.remarks,
            "processed_at": claim.processed_at.isoformat(),
        }
    )
    return payload


def _format_integrity_error() -> str:
    return "Claim ID must be unique"


def _normalize_documents(document_names: list[str]) -> list[str]:
    return [name.strip() for name in document_names if name and name.strip()]


def _compute_missing_documents(policy_type: str, document_names: list[str]) -> bool:
    names = [name.lower() for name in document_names]
    required_keywords = REQUIRED_DOC_KEYWORDS.get(policy_type, [])
    return any(not any(keyword in name for name in names) for keyword in required_keywords)


def _ensure_missing_documents(claim: Union[ClaimSubmit, ClaimUpdate]) -> Union[ClaimSubmit, ClaimUpdate]:
    normalized_documents = _normalize_documents(claim.documents)
    return claim.copy(
        update={
            "documents": normalized_documents,
            "missing_documents": _compute_missing_documents(claim.policy_type, normalized_documents),
        }
    )


def submit_claim(unprocessed_db: Session, processed_db: Session, claim: ClaimSubmit) -> dict:
    claim = _ensure_missing_documents(claim)
    errors = validate_claim(claim)
    if errors:
        logger.warning("Validation failed for %s: %s", claim.claim_id, "; ".join(errors))
        raise HTTPException(status_code=422, detail=errors)

    exists_unprocessed = unprocessed_db.query(UnprocessedClaim).filter(UnprocessedClaim.claim_id == claim.claim_id).first()
    exists_processed = processed_db.query(ProcessedClaim).filter(ProcessedClaim.claim_id == claim.claim_id).first()
    if exists_unprocessed or exists_processed:
        raise HTTPException(status_code=409, detail="Claim ID must be unique")

    model = _build_unprocessed_model(claim)
    try:
        unprocessed_db.add(model)
        unprocessed_db.commit()
        unprocessed_db.refresh(model)
        logger.info("Submitted claim %s to unprocessed database", claim.claim_id)
        return _serialize_unprocessed(model)
    except IntegrityError as exc:
        unprocessed_db.rollback()
        logger.exception("Duplicate claim while submitting %s", claim.claim_id)
        raise HTTPException(status_code=409, detail=_format_integrity_error()) from exc
    except SQLAlchemyError as exc:
        unprocessed_db.rollback()
        logger.exception("Database failure while submitting %s", claim.claim_id)
        raise HTTPException(status_code=500, detail="Database failure") from exc


def list_unprocessed_claims(db: Session) -> list[dict]:
    items = db.query(UnprocessedClaim).order_by(UnprocessedClaim.id.desc()).all()
    return [_serialize_unprocessed(item) for item in items]


def process_pending_claims(unprocessed_db: Session, processed_db: Session) -> list[dict]:
    pending_claims = unprocessed_db.query(UnprocessedClaim).order_by(UnprocessedClaim.id.asc()).all()
    results: list[dict] = []

    for item in pending_claims:
        claim = ClaimSubmit(
            claim_id=item.claim_id,
            customer_name=item.customer_name,
            customer_age=item.customer_age,
            policy_type=item.policy_type,
            claim_amount=item.claim_amount,
            documents=json.loads(item.documents or "[]"),
            previous_claims=item.previous_claims,
            hospital=item.hospital,
            vehicle_number=item.vehicle_number,
            garage_name=item.garage_name,
            nominee_name=item.nominee_name,
            nominee_relationship=item.nominee_relationship,
            missing_documents=bool(item.missing_documents),
        )
        processed_model = _build_processed_model(claim, item.claim_id)

        try:
            processed_db.add(processed_model)
            processed_db.commit()
            processed_db.refresh(processed_model)
            unprocessed_db.delete(item)
            unprocessed_db.commit()
            logger.info("Processed claim %s", item.claim_id)
            results.append(
                {
                    "claim_id": processed_model.claim_id,
                    "validation_status": processed_model.validation_status,
                    "decision": processed_model.decision,
                    "risk_category": processed_model.risk_category,
                    "remarks": processed_model.remarks,
                }
            )
        except IntegrityError:
            processed_db.rollback()
            unprocessed_db.rollback()
            results.append(
                {
                    "claim_id": item.claim_id,
                    "validation_status": "Failed",
                    "decision": None,
                    "risk_category": None,
                    "remarks": "Claim ID must be unique",
                }
            )
        except SQLAlchemyError as exc:
            processed_db.rollback()
            unprocessed_db.rollback()
            logger.exception("Processing failed for %s", item.claim_id)
            raise HTTPException(status_code=500, detail="Database failure") from exc

    logger.info("Processing summary: %s claims processed", len(results))
    return results


def get_processed_claim_or_404(db: Session, claim_id: str) -> ProcessedClaim:
    claim = db.query(ProcessedClaim).filter(ProcessedClaim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim


def list_processed_claims(
    db: Session,
    page: int = 1,
    size: int = 10,
    decision: Optional[str] = None,
    policy_type: Optional[str] = None,
    risk_category: Optional[str] = None,
) -> tuple[list[ProcessedClaim], int]:
    query = db.query(ProcessedClaim)
    if decision:
        query = query.filter(ProcessedClaim.decision == decision)
    if policy_type:
        query = query.filter(ProcessedClaim.policy_type == policy_type)
    if risk_category:
        query = query.filter(ProcessedClaim.risk_category == risk_category)

    total = query.count()
    items = query.order_by(ProcessedClaim.id.desc()).offset((page - 1) * size).limit(size).all()
    return items, total


def update_processed_claim(db: Session, claim_id: str, claim_data: ClaimUpdate) -> ProcessedClaim:
    existing = get_processed_claim_or_404(db, claim_id)
    updated = _build_processed_model(claim_data, claim_id)

    existing.customer_name = updated.customer_name
    existing.customer_age = updated.customer_age
    existing.policy_type = updated.policy_type
    existing.claim_amount = updated.claim_amount
    existing.documents = updated.documents
    existing.previous_claims = updated.previous_claims
    existing.hospital = updated.hospital
    existing.vehicle_number = updated.vehicle_number
    existing.garage_name = updated.garage_name
    existing.nominee_name = updated.nominee_name
    existing.nominee_relationship = updated.nominee_relationship
    existing.missing_documents = updated.missing_documents
    existing.decision = updated.decision
    existing.risk_category = updated.risk_category
    existing.validation_status = updated.validation_status
    existing.remarks = updated.remarks

    try:
        db.commit()
        db.refresh(existing)
        logger.info("Updated claim %s", claim_id)
        return existing
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Database failure while updating %s", claim_id)
        raise HTTPException(status_code=500, detail="Database failure") from exc


def delete_processed_claim(db: Session, claim_id: str) -> None:
    claim = get_processed_claim_or_404(db, claim_id)
    try:
        db.delete(claim)
        db.commit()
        logger.info("Deleted claim %s", claim_id)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Database failure while deleting %s", claim_id)
        raise HTTPException(status_code=500, detail="Database failure") from exc


def serialize_processed_claim(claim: ProcessedClaim) -> dict:
    return _serialize_processed(claim)


def build_summary(db: Session) -> dict:
    total = db.query(func.count(ProcessedClaim.id)).scalar() or 0
    approved = db.query(func.count(ProcessedClaim.id)).filter(ProcessedClaim.decision == "Approved").scalar() or 0
    rejected = db.query(func.count(ProcessedClaim.id)).filter(ProcessedClaim.decision == "Rejected").scalar() or 0
    manual_verification = db.query(func.count(ProcessedClaim.id)).filter(ProcessedClaim.decision == "Manual Verification").scalar() or 0
    need_review = db.query(func.count(ProcessedClaim.id)).filter(ProcessedClaim.decision == "Need Review").scalar() or 0
    senior_review = db.query(func.count(ProcessedClaim.id)).filter(ProcessedClaim.decision == "Senior Review").scalar() or 0
    validation_failed = db.query(func.count(ProcessedClaim.id)).filter(ProcessedClaim.validation_status == "Failed").scalar() or 0

    return {
        "total": total,
        "approved": approved,
        "rejected": rejected,
        "manual_verification": manual_verification,
        "need_review": need_review,
        "senior_review": senior_review,
        "validation_failed": validation_failed,
    }


def high_risk_claims(db: Session) -> list[dict]:
    items = db.query(ProcessedClaim).filter(ProcessedClaim.risk_category == "High").order_by(ProcessedClaim.id.desc()).all()
    return [serialize_processed_claim(item) for item in items]
