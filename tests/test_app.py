import os
from pathlib import Path

os.environ["UNPROCESSED_DATABASE_URL"] = "sqlite:///./test_unprocessed_claims.db"
os.environ["PROCESSED_DATABASE_URL"] = "sqlite:///./test_processed_claims.db"

from fastapi.testclient import TestClient

from app.database import ProcessedBase, UnprocessedBase, create_all_tables, processed_engine, unprocessed_engine
from app.main import app


client = TestClient(app)


def setup_module():
    UnprocessedBase.metadata.drop_all(bind=unprocessed_engine)
    ProcessedBase.metadata.drop_all(bind=processed_engine)
    create_all_tables()


def teardown_module():
    client.close()
    UnprocessedBase.metadata.drop_all(bind=unprocessed_engine)
    ProcessedBase.metadata.drop_all(bind=processed_engine)
    unprocessed_engine.dispose()
    processed_engine.dispose()
    for file_name in ("test_unprocessed_claims.db", "test_processed_claims.db"):
        path = Path(file_name)
        if path.exists():
            path.unlink()


def submit_claim(policy_type, extra_data, file_names):
    data = {
        "customer_name": extra_data.get("customer_name", "Rahul Sharma"),
        "customer_age": str(extra_data.get("customer_age", 45)),
        "policy_type": policy_type,
        "claim_amount": str(extra_data.get("claim_amount", 30000)),
        "previous_claims": str(extra_data.get("previous_claims", 1)),
        "hospital": extra_data.get("hospital", ""),
        "vehicle_number": extra_data.get("vehicle_number", ""),
        "garage_name": extra_data.get("garage_name", ""),
        "nominee_name": extra_data.get("nominee_name", ""),
        "nominee_relationship": extra_data.get("nominee_relationship", ""),
    }
    files = [("documents", (name, b"dummy-content", "application/pdf")) for name in file_names]
    return client.post("/claims/submit", data=data, files=files)


def test_submit_and_process_flow():
    submit_response = submit_claim(
        "Health",
        {"hospital": "Apollo Hospital"},
        ["invoice.pdf", "health_card.pdf"],
    )
    assert submit_response.status_code == 200
    claim_id = submit_response.json()["claim_id"]
    assert claim_id.startswith("CLM")

    pending_response = client.get("/unprocessed-claims")
    assert pending_response.status_code == 200
    assert len(pending_response.json()) == 1

    process_response = client.post("/claims/process")
    assert process_response.status_code == 200
    assert process_response.json()["processed_count"] == 1

    processed_response = client.get("/claims")
    assert processed_response.status_code == 200
    body = processed_response.json()
    assert body["total"] == 1
    assert body["items"][0]["claim_id"] == claim_id

    summary_response = client.get("/summary")
    assert summary_response.status_code == 200
    assert summary_response.json()["total"] == 1


def test_search_update_delete_and_filters():
    submit_response = submit_claim(
        "Motor",
        {
            "customer_age": 33,
            "claim_amount": 60000,
            "vehicle_number": "MH12AB1234",
            "garage_name": "City Garage",
        },
        ["invoice.pdf", "rc.pdf"],
    )
    assert submit_response.status_code == 200
    claim_id = submit_response.json()["claim_id"]
    client.post("/claims/process")

    search_response = client.get(f"/claims/{claim_id}")
    assert search_response.status_code == 200
    assert search_response.json()["policy_type"] == "Motor"

    update_data = {
        "customer_name": "Rahul Sharma Updated",
        "customer_age": "75",
        "policy_type": "Motor",
        "claim_amount": "65000",
        "previous_claims": "3",
        "vehicle_number": "MH12AB1234",
        "garage_name": "City Garage",
        "hospital": "",
        "nominee_name": "",
        "nominee_relationship": "",
    }
    update_files = [("documents", ("invoice.pdf", b"dummy-content", "application/pdf")), ("documents", ("rc.pdf", b"dummy-content", "application/pdf"))]
    update_response = client.put(f"/claims/{claim_id}", data=update_data, files=update_files)
    assert update_response.status_code == 200
    assert update_response.json()["customer_name"] == "Rahul Sharma Updated"

    filter_response = client.get("/claims?policy_type=Motor&risk_category=High")
    assert filter_response.status_code == 200

    high_risk_response = client.get("/claims/high-risk")
    assert high_risk_response.status_code == 200
    assert any(item["claim_id"] == claim_id for item in high_risk_response.json())

    delete_response = client.delete(f"/claims/{claim_id}")
    assert delete_response.status_code == 200

    not_found_response = client.get(f"/claims/{claim_id}")
    assert not_found_response.status_code == 404


def test_life_policy_submission():
    response = submit_claim(
        "Life",
        {
            "customer_age": 52,
            "claim_amount": 50000,
            "nominee_name": "Asha Sharma",
            "nominee_relationship": "Spouse",
        },
        ["invoice.pdf", "id_proof.pdf"],
    )
    assert response.status_code == 200
    assert response.json()["policy_type"] == "Life"
