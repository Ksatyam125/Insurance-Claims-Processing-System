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
- Claim ID is generated automatically after submission
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

## Database Schema

The app uses two SQLite databases:

- `unprocessed_claims.db` for claims waiting to be processed
- `processed_claims.db` for claims after validation and business-rule evaluation

### `unprocessed_claims`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `claim_id` | String | Unique, required |
| `customer_name` | String | Required |
| `customer_age` | Integer | Required, 18 to 100 |
| `policy_type` | String | Required, `Health` / `Motor` / `Life` |
| `claim_amount` | Integer | Required, greater than zero |
| `documents` | Text | JSON list of uploaded filenames |
| `previous_claims` | Integer | Required, default `0` |
| `hospital` | String | Optional |
| `vehicle_number` | String | Optional |
| `garage_name` | String | Optional |
| `nominee_name` | String | Optional |
| `nominee_relationship` | String | Optional |
| `missing_documents` | Boolean | Default `false` |
| `created_at` | DateTime | Auto-generated |
| `updated_at` | DateTime | Auto-updated |

### `processed_claims`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `claim_id` | String | Unique, required |
| `customer_name` | String | Required |
| `customer_age` | Integer | Required, 18 to 100 |
| `policy_type` | String | Required, `Health` / `Motor` / `Life` |
| `claim_amount` | Integer | Required, greater than zero |
| `documents` | Text | JSON list of uploaded filenames |
| `previous_claims` | Integer | Required, default `0` |
| `hospital` | String | Optional |
| `vehicle_number` | String | Optional |
| `garage_name` | String | Optional |
| `nominee_name` | String | Optional |
| `nominee_relationship` | String | Optional |
| `missing_documents` | Boolean | Default `false` |
| `decision` | String | Final business-rule decision |
| `risk_category` | String | `Low`, `Medium`, or `High` |
| `validation_status` | String | `Passed` or `Failed` |
| `remarks` | Text | Validation or processing notes |
| `created_at` | DateTime | Auto-generated |
| `updated_at` | DateTime | Auto-updated |
| `processed_at` | DateTime | Timestamp when processed |

## Sample Request Payloads Used for Testing

The `POST /claims/submit` endpoint accepts `multipart/form-data`. The claim ID is generated automatically by the backend after submission, so it is not entered manually.

## Postman Request Formats

Set a Postman environment variable like this:

- `baseUrl` = `http://127.0.0.1:8000`

### 1. Submit Claim

- Method: `POST`
- URL: `{{baseUrl}}/claims/submit`
- Body: `form-data`

| Key | Value type | Example |
| --- | --- | --- |
| `customer_name` | Text | `Rahul Sharma` |
| `customer_age` | Text | `45` |
| `policy_type` | Text | `Health` |
| `claim_amount` | Text | `30000` |
| `previous_claims` | Text | `1` |
| `hospital` | Text | `Apollo Hospital` |
| `documents` | File | `invoice.pdf` |
| `documents` | File | `health_card.pdf` |

For Motor claims, replace the optional fields and files:

| Key | Value type | Example |
| --- | --- | --- |
| `vehicle_number` | Text | `MH12AB1234` |
| `garage_name` | Text | `City Garage` |
| `documents` | File | `invoice.pdf` |
| `documents` | File | `rc.pdf` |

For Life claims:

| Key | Value type | Example |
| --- | --- | --- |
| `nominee_name` | Text | `Asha Sharma` |
| `nominee_relationship` | Text | `Spouse` |
| `documents` | File | `invoice.pdf` |
| `documents` | File | `id_proof.pdf` |

### 2. Process All Claims

- Method: `POST`
- URL: `{{baseUrl}}/claims/process`
- Body: none

### 3. Get Processed Claims

- Method: `GET`
- URL: `{{baseUrl}}/claims?page=1&size=10`
- Optional query params:
  - `decision`
  - `policy_type`
  - `risk_category`

Example:

- `{{baseUrl}}/claims?page=1&size=10&decision=Approved&policy_type=Health&risk_category=High`

### 4. Get One Claim

- Method: `GET`
- URL: `{{baseUrl}}/claims/{{claim_id}}`

### 5. Update Claim

- Method: `PUT`
- URL: `{{baseUrl}}/claims/{{claim_id}}`
- Body: `form-data`

Use the same fields as submit, plus updated values if needed.

If you upload new files, add them under `documents` as file fields.

### 6. Delete Claim

- Method: `DELETE`
- URL: `{{baseUrl}}/claims/{{claim_id}}`

### 7. Summary

- Method: `GET`
- URL: `{{baseUrl}}/summary`

### 8. High Risk Claims

- Method: `GET`
- URL: `{{baseUrl}}/claims/high-risk`

### Health claim sample

```text
POST /claims/submit

customer_name = Rahul Sharma
customer_age = 45
policy_type = Health
claim_amount = 30000
previous_claims = 1
hospital = Apollo Hospital
documents = invoice.pdf
documents = health_card.pdf
```

### Motor claim sample

```text
POST /claims/submit

customer_name = Rahul Sharma
customer_age = 33
policy_type = Motor
claim_amount = 60000
previous_claims = 1
vehicle_number = MH12AB1234
garage_name = City Garage
documents = invoice.pdf
documents = rc.pdf
```

### Life claim sample

```text
POST /claims/submit

customer_name = Rahul Sharma
customer_age = 52
policy_type = Life
claim_amount = 50000
previous_claims = 1
nominee_name = Asha Sharma
nominee_relationship = Spouse
documents = invoice.pdf
documents = id_proof.pdf
```

## Business Rules

The application accepts `Health`, `Motor`, and `Life` claims.

Decision priority:

1. Claim amount > 100000 and previous claims > 5 -> `Rejected`
2. Missing documents -> `Need Review`
3. For `Health` claims only, hospital not in approved network -> `Manual Verification`
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

## Assumptions Made

- Claims are submitted for `Health`, `Motor`, or `Life` policies.
- Claim ID is generated automatically by the backend.
- Uploaded document filenames are used for validation.
- Claims are first stored in `unprocessed_claims.db` and then moved to `processed_claims.db`.
- SQLite is enough for this project.

## Design Decisions

- FastAPI is used for the backend and SQLAlchemy for database access.
- Validation and business rules are kept separate in `schemas.py` and `services.py`.
- Business rules are applied in priority order to produce one final decision.
- Risk score is calculated separately from decision logic.
- Logging and tests are included for reliability.
- The frontend is kept simple and only consumes the backend APIs.

## Future Improvements

- Add a verification workflow so `Need Review` claims can be updated to `Approved` or `Rejected` after manual checks.
- Support file content validation instead of relying only on uploaded filenames.
- Add role-based access for user, executive, and admin actions.
- Replace the current SQLite setup with a production database such as PostgreSQL.
- Add export options for processed claims and dashboard reports.
- Improve audit logging for status changes, especially for reviewed claims.

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
