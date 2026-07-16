from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ClaimBase(BaseModel):
    customer_name: str = Field(min_length=1)
    customer_age: int = Field(ge=18, le=100)
    policy_type: Literal["Health", "Motor", "Life"]
    claim_amount: int = Field(gt=0)
    documents: List[str] = Field(min_length=1)
    previous_claims: int = Field(ge=0, default=0)
    hospital: Optional[str] = None
    vehicle_number: Optional[str] = None
    garage_name: Optional[str] = None
    nominee_name: Optional[str] = None
    nominee_relationship: Optional[str] = None
    missing_documents: bool = False


class ClaimSubmit(ClaimBase):
    claim_id: str = Field(min_length=1)


class ClaimUpdate(ClaimBase):
    pass


class ProcessClaimsRequest(BaseModel):
    claims: List[ClaimSubmit] = Field(default_factory=list)


class ClaimItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    claim_id: str
    customer_name: str
    customer_age: int
    policy_type: str
    claim_amount: int
    documents: List[str]
    previous_claims: int
    hospital: Optional[str] = None
    vehicle_number: Optional[str] = None
    garage_name: Optional[str] = None
    nominee_name: Optional[str] = None
    nominee_relationship: Optional[str] = None
    missing_documents: bool = False
    created_at: str
    updated_at: str


class UnprocessedClaimItem(ClaimItem):
    pass


class ProcessedClaimItem(ClaimItem):
    decision: Optional[str] = None
    risk_category: Optional[str] = None
    validation_status: str
    remarks: Optional[str] = None
    processed_at: str


class ProcessedClaimResult(BaseModel):
    claim_id: str
    validation_status: str
    decision: Optional[str] = None
    risk_category: Optional[str] = None
    remarks: Optional[str] = None


class ProcessResponse(BaseModel):
    message: str
    processed_count: int
    results: List[ProcessedClaimResult]


class PaginatedProcessedClaimsResponse(BaseModel):
    total: int
    page: int
    size: int
    items: List[ProcessedClaimItem]


class DashboardSummaryResponse(BaseModel):
    total: int
    approved: int
    rejected: int
    manual_verification: int
    need_review: int
    validation_failed: int
