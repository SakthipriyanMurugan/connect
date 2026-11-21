from fastapi.testclient import TestClient
from app.main import app

def test_phase3_calling():
    with TestClient(app) as client:
        print("\n--- 1. Testing LiveKit Token Generation ---")
        res = client.post("/api/v1/livekit/token", json={
            "room_name": "room-automated-test",
            "participant_identity": "test_user_ironman",
            "participant_name": "Tony Stark"
        })
        print("Status code:", res.status_code)
        assert res.status_code == 200
        data = res.json()
        assert data.get("success") is True
        assert bool(data.get("token")) is True
        assert "connect-jflh7xn8.livekit.cloud" in data.get("url")
        print("LiveKit URL:", data.get("url"))
        print("Generated Token Length:", len(data.get("token")))

        print("\n--- 2. Testing LiveKit Token for Video Call ---")
        res2 = client.post("/api/v1/livekit/token", json={
            "room_name": "call_sakthi_hinata",
            "participant_identity": "user_sakthi",
            "participant_name": "Sakthi"
        })
        assert res2.status_code == 200
        print("Room token created for call_sakthi_hinata!")

        print("\n=======================================================")
        print("🎉 ALL PHASE 3 LIVEKIT BACKEND TESTS PASSED 100%! 🎉")
        print("=======================================================")

if __name__ == "__main__":
    test_phase3_calling()
