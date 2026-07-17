from contextlib import asynccontextmanager
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import (
    ProcessedSessionLocal,
    UnprocessedSessionLocal,
    create_all_tables,
    processed_engine,
    unprocessed_engine,
)
from app.schemas import (
    ClaimSubmit,
    ClaimUpdate,
    DashboardSummaryResponse,
    PaginatedProcessedClaimsResponse,
    ProcessResponse,
    ProcessedClaimItem,
    UnprocessedClaimItem,
)
from app.services import (
    build_summary,
    delete_processed_claim,
    generate_claim_id,
    get_processed_claim_or_404,
    high_risk_claims,
    list_processed_claims,
    list_unprocessed_claims,
    process_pending_claims,
    serialize_processed_claim,
    submit_claim,
    update_processed_claim,
)


def setup_logging() -> None:
    logger = logging.getLogger("claims_app")
    if logger.handlers:
        return
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

    file_handler = RotatingFileHandler("claims.log", maxBytes=1_000_000, backupCount=3)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)


setup_logging()
logger = logging.getLogger("claims_app")


def get_unprocessed_db():
    db = UnprocessedSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_processed_db():
    db = ProcessedSessionLocal()
    try:
        yield db
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Application startup")
    create_all_tables()
    yield


app = FastAPI(title="Insurance Claims Processing System", lifespan=lifespan)

static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("Incoming API request: %s %s", request.method, request.url.path)
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_: Request, exc: SQLAlchemyError):
    logger.exception("Unexpected database error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Database failure"})


@app.get("/")
def home():
    user_file = static_dir / "user.html"
    if not user_file.exists():
        raise HTTPException(status_code=404, detail="User frontend not found")
    return FileResponse(user_file)


@app.get("/portal")
def portal():
    portal_file = static_dir / "portal.html"
    if not portal_file.exists():
        raise HTTPException(status_code=404, detail="Portal frontend not found")
    return FileResponse(portal_file)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/claims/submit", response_model=UnprocessedClaimItem)
async def create_unprocessed_claim(
    customer_name: str = Form(...),
    customer_age: int = Form(...),
    policy_type: str = Form(...),
    claim_amount: int = Form(...),
    previous_claims: int = Form(0),
    hospital: Optional[str] = Form(None),
    vehicle_number: Optional[str] = Form(None),
    garage_name: Optional[str] = Form(None),
    nominee_name: Optional[str] = Form(None),
    nominee_relationship: Optional[str] = Form(None),
    documents: list[UploadFile] = File(...),
    unprocessed_db: Session = Depends(get_unprocessed_db),
    processed_db: Session = Depends(get_processed_db),
):
    claim_id = generate_claim_id(unprocessed_db, processed_db)
    payload = ClaimSubmit(
        claim_id=claim_id,
        customer_name=customer_name,
        customer_age=customer_age,
        policy_type=policy_type,
        claim_amount=claim_amount,
        previous_claims=previous_claims,
        hospital=hospital,
        vehicle_number=vehicle_number,
        garage_name=garage_name,
        nominee_name=nominee_name,
        nominee_relationship=nominee_relationship,
        documents=[document.filename for document in documents],
    )
    return submit_claim(unprocessed_db, processed_db, payload)


@app.get("/unprocessed-claims", response_model=list[UnprocessedClaimItem])
def get_unprocessed_claims(unprocessed_db: Session = Depends(get_unprocessed_db)):
    return list_unprocessed_claims(unprocessed_db)


@app.post("/claims/process", response_model=ProcessResponse)
def process_claims(
    unprocessed_db: Session = Depends(get_unprocessed_db),
    processed_db: Session = Depends(get_processed_db),
):
    results = process_pending_claims(unprocessed_db, processed_db)
    return {
        "message": "Claims processed successfully",
        "processed_count": len(results),
        "results": results,
    }


@app.get("/claims", response_model=PaginatedProcessedClaimsResponse)
def get_claims(
    page: int = 1,
    size: int = 10,
    decision: Optional[str] = None,
    policy_type: Optional[str] = None,
    risk_category: Optional[str] = None,
    db: Session = Depends(get_processed_db),
):
    items, total = list_processed_claims(
        db,
        page=page,
        size=size,
        decision=decision,
        policy_type=policy_type,
        risk_category=risk_category,
    )
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [serialize_processed_claim(item) for item in items],
    }


@app.get("/claims/high-risk", response_model=list[ProcessedClaimItem])
def get_high_risk_claims(db: Session = Depends(get_processed_db)):
    return high_risk_claims(db)


@app.get("/claims/{claim_id}", response_model=ProcessedClaimItem)
def get_claim(claim_id: str, db: Session = Depends(get_processed_db)):
    return serialize_processed_claim(get_processed_claim_or_404(db, claim_id))


@app.put("/claims/{claim_id}", response_model=ProcessedClaimItem)
async def update_claim(
    claim_id: str,
    customer_name: str = Form(...),
    customer_age: int = Form(...),
    policy_type: str = Form(...),
    claim_amount: int = Form(...),
    previous_claims: int = Form(0),
    hospital: Optional[str] = Form(None),
    vehicle_number: Optional[str] = Form(None),
    garage_name: Optional[str] = Form(None),
    nominee_name: Optional[str] = Form(None),
    nominee_relationship: Optional[str] = Form(None),
    documents: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_processed_db),
):
    existing = get_processed_claim_or_404(db, claim_id)
    existing_documents = json.loads(existing.documents or "[]")
    selected_documents = [document.filename for document in documents] if documents else existing_documents
    payload = ClaimUpdate(
        customer_name=customer_name,
        customer_age=customer_age,
        policy_type=policy_type,
        claim_amount=claim_amount,
        previous_claims=previous_claims,
        hospital=hospital,
        vehicle_number=vehicle_number,
        garage_name=garage_name,
        nominee_name=nominee_name,
        nominee_relationship=nominee_relationship,
        documents=selected_documents,
    )
    return serialize_processed_claim(update_processed_claim(db, claim_id, payload))


@app.delete("/claims/{claim_id}")
def remove_claim(claim_id: str, db: Session = Depends(get_processed_db)):
    delete_processed_claim(db, claim_id)
    return {"message": "Claim deleted successfully"}


@app.get("/summary", response_model=DashboardSummaryResponse)
def summary(db: Session = Depends(get_processed_db)):
    return build_summary(db)
