# Insurance Claims Processing System

A simple FastAPI project for Health, Motor, and Life insurance claims. It includes a basic frontend built with HTML, CSS, and JavaScript, plus two SQLite databases:

- `unprocessed_claims.db` for incoming claims
- `processed_claims.db` for processed claims

## Tech Stack

- Python 3.11+
- FastAPI
- SQLite
- SQLAlchemy
- Pytest
- Plain HTML/CSS/JavaScript

## What the App Does

- User selects a policy type and submits a claim from the frontend
- Claim is stored in the unprocessed claims database
- Executive can view all pending claims
- Executive can process all pending claims with one button
- Processed claims are stored in the processed claims database
- Processed claims can be searched, updated, deleted, filtered, and paginated
- Dashboard shows KPIs, charts, and high-risk customers

## How to Run

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the app:

```bash
python -m uvicorn app.main:app --reload
```

Open the app in your browser:

```text
http://127.0.0.1:8000/
```

## Frontend Screens

### 1. User Screen

- Claim submission form
- Policy type selection
- Policy-specific fields for Health, Motor, and Life
- Real file upload for documents
- Saves data to the unprocessed claims database

### 2. Executive Screen

- Shows all incoming claims
- `Process All Claims` button calls `POST /claims/process`
- After processing, claims move to the processed claims database

### 3. Processed Claims Screen

- Uses `GET /claims`
- Supports pagination
- Supports filtering by Decision and Policy Type
- Update claim button opens a popup and calls `PUT /claims/{claim_id}`
- Delete claim button calls `DELETE /claims/{claim_id}`
- Search bar calls `GET /claims/{claim_id}`

### 4. Dashboard Screen

- Calls `GET /summary`
- Shows KPI cards and charts
- Calls `GET /claims/high-risk`
- Displays high-risk customers

## API Endpoints

- `POST /claims/submit` - save a new claim to the unprocessed database
- `GET /unprocessed-claims` - list incoming claims
- `POST /claims/process` - process all pending claims
- `GET /claims` - list processed claims with pagination and filters
- `GET /claims/{claim_id}` - get one processed claim
- `PUT /claims/{claim_id}` - update and reprocess a processed claim
- `DELETE /claims/{claim_id}` - delete a processed claim
- `GET /summary` - dashboard KPIs
- `GET /claims/high-risk` - list high-risk processed claims

## Business Rules

Only `Health` insurance claims are accepted.

Decision priority:

1. Claim amount > 100000 and previous claims > 5 -> `Rejected`
2. Missing documents -> `Need Review`
3. Hospital not in approved network -> `Manual Verification`
4. Customer age > 70 and claim amount > 50000 -> `Senior Review`
5. Otherwise -> `Approved`

Approved hospitals:

- City Care Hospital
- Apollo Hospital
- Global Hospital

## Risk Score

- Age 18-30 -> 10
- Age 31-60 -> 20
- Age 61+ -> 40
- Claim amount 0-10000 -> 5
- Claim amount 10001-50000 -> 15
- Claim amount above 50000 -> 30
- Previous claims 0 -> 0
- Previous claims 1-2 -> 10
- Previous claims 3+ -> 30

Risk category:

- 0-30 -> Low
- 31-60 -> Medium
- Above 60 -> High

## Tests

Run automated tests with:

```bash
python -m pytest -q
```

## Notes

- The frontend is intentionally simple so it is easier to understand and extend.
- Required document names are checked from uploaded filenames.
- Policy-specific required fields are handled in the form and backend validation.
- Charts are drawn with plain JavaScript canvas code, so there is no external chart library.
