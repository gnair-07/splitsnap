from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class ExtractedItem(BaseModel):
    id: str = Field(description="Unique string identifier (e.g. item_1)")
    name: str = Field(description="Cleaned item name from receipt")
    price: float = Field(ge=0, description="Total price for this line item")
    quantity: int = Field(default=1, ge=1, description="Quantity ordered")


class ParsedReceipt(BaseModel):
    merchant: str = Field(default="Unknown merchant", description="Restaurant or store name")
    date: str = Field(default="", description="Date of receipt (YYYY-MM-DD if found)")
    currency: str = Field(default="$", description="Currency symbol ($, ₹, €, £)")
    items: List[ExtractedItem]
    subtotal: float = Field(ge=0, description="Sum of all line items before tax/fees")
    tax: float = Field(default=0.0, ge=0, description="Itemized tax (sales tax, VAT, GST)")
    service_charge: float = Field(default=0.0, ge=0, description="Mandatory service fee or gratuity")
    tip: float = Field(default=0.0, ge=0, description="Added tip")
    discount: float = Field(default=0.0, ge=0, description="Discounts or promotions subtracted")
    grand_total: float = Field(ge=0, description="Final total billed on the receipt")

    # Vision models often return null for missing fields; treat them as "not present".
    @field_validator("date", "merchant", "currency", mode="before")
    @classmethod
    def _none_to_default_text(cls, v, info):
        if v is None:
            return {"date": "", "merchant": "Unknown merchant", "currency": "$"}[info.field_name]
        return v

    @field_validator("tax", "service_charge", "tip", "discount", mode="before")
    @classmethod
    def _none_to_zero(cls, v):
        return 0.0 if v is None else v


class Participant(BaseModel):
    id: str
    name: str
    avatar_color: str
    upi_id: Optional[str] = ""         # UPI VPA of this person (used when THEY are the organizer), e.g. name@okaxis
    paypal_handle: Optional[str] = ""  # PayPal.me username (used when THEY are the organizer)


class SplitCalculationRequest(BaseModel):
    receipt: ParsedReceipt
    participants: List[Participant] = Field(min_length=1)
    # item_id -> participant IDs who share the item equally
    item_assignments: Dict[str, List[str]] = Field(default_factory=dict)
    # Optional weighted split. item_id -> {participant_id: weight}. Overrides item_assignments for that item.
    # Example: {"item_4": {"p1": 2, "p2": 1}} -> p1 pays 2/3 of the item, p2 pays 1/3.
    custom_shares: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    # The participant who paid the restaurant. Everyone else pays THIS person.
    organizer_id: Optional[str] = None


class ParticipantBreakdown(BaseModel):
    participant_id: str
    name: str
    raw_subtotal: float
    proportional_tax: float
    proportional_fees_and_tips: float
    proportional_discount: float
    proportional_adjustment: float  # share of any receipt rounding/OCR difference (usually 0.00)
    final_amount: float
    assigned_items: List[str]       # Item names
    is_organizer: bool = False
    payment_link_upi: str = ""      # empty when not applicable (organizer, non-INR, or no UPI id)
    payment_link_paypal: str = ""   # empty when not applicable


class SplitCalculationResponse(BaseModel):
    is_balanced: bool               # True only when every cent of the bill is assigned to someone
    receipt_total: float
    calculated_sum: float           # sum of all participants' final amounts
    unassigned_amount: float        # receipt_total - calculated_sum (items nobody has claimed, incl. their tax/fees)
    receipt_adjustment: float       # grand_total minus (items + tax + fees - discount); spread proportionally
    breakdowns: List[ParticipantBreakdown]
