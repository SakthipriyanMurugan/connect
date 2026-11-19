import asyncio
import io
from fastapi.testclient import TestClient
from app.main import app

def run_tests():
    with TestClient(app) as client:
        print("\n--- 1. Testing Connect ID Availability Check ---")
        # Check initial availability
        r = client.get("/api/v1/auth/check-connect-id?connect_id=iron_man")
        print("Check connect ID iron_man (expect available):", r.status_code, r.json())
        assert r.status_code == 200
        assert r.json()["available"] is True

        print("\n--- 2. Testing Signup for User 1 with unique Connect ID ---")
        r1 = client.post("/api/v1/auth/signup", json={
            "email": "tony@stark.com",
            "password": "Password123!",
            "name": "Tony Stark",
            "connect_id": "iron_man"
        })
        print("Signup Tony Stark:", r1.status_code, r1.json().get("user", {}).get("connect_id"))
        assert r1.status_code == 200
        user1 = r1.json()["user"]
        user1_id = user1["id"]
        assert user1["connect_id"] == "iron_man"

        print("\n--- 3. Testing Connect ID Collision (now taken) ---")
        r = client.get("/api/v1/auth/check-connect-id?id=iron_man")
        print("Check connect ID iron_man (expect taken):", r.status_code, r.json())
        assert r.status_code == 200
        assert r.json()["available"] is False

        print("\n--- 4. Testing Signup for User 2 ---")
        r2 = client.post("/api/v1/auth/signup", json={
            "email": "steve@rogers.com",
            "password": "Password123!",
            "name": "Steve Rogers",
            "connect_id": "cap_america"
        })
        print("Signup Steve Rogers:", r2.status_code, r2.json().get("user", {}).get("connect_id"))
        assert r2.status_code == 200
        user2 = r2.json()["user"]
        user2_id = user2["id"]
        assert user2["connect_id"] == "cap_america"

        print("\n--- 5. Testing Login with Connect ID (no email needed) ---")
        r_login = client.post("/api/v1/auth/login", json={
            "connect_id": "@iron_man",
            "password": "Password123!"
        })
        print("Login with @iron_man:", r_login.status_code, r_login.json().get("user", {}).get("name"))
        assert r_login.status_code == 200
        assert r_login.json()["user"]["id"] == user1_id

        print("\n--- 6. User 2 Searches for User 1 by Connect ID ---")
        r_search = client.get(f"/api/v1/users/search?q=iron_man&current_user_id={user2_id}")
        print("Search results for 'iron_man':", r_search.status_code, len(r_search.json()))
        assert r_search.status_code == 200
        assert len(r_search.json()) >= 1
        target = r_search.json()[0]
        assert target["connect_id"] == "iron_man"
        assert target["connection_status"] == "none"

        print("\n--- 7. User 2 Sends Connection Request to User 1 ---")
        r_req = client.post("/api/v1/connections/request", json={
            "from_user_id": user2_id,
            "target_connect_id": "iron_man"
        })
        print("Send connection request:", r_req.status_code, r_req.json())
        assert r_req.status_code == 200
        conn_id = r_req.json()["connection_id"]

        print("\n--- 8. User 1 Sees Incoming Request & Accepts ---")
        r_conns1 = client.get(f"/api/v1/connections?user_id={user1_id}")
        assert len(r_conns1.json()["pending_incoming"]) >= 1
        print("Pending incoming for Tony:", len(r_conns1.json()["pending_incoming"]))

        r_acc = client.post("/api/v1/connections/accept", json={
            "connection_id": conn_id,
            "user_id": user1_id
        })
        print("Accept connection request:", r_acc.status_code, r_acc.json())
        assert r_acc.status_code == 200 and r_acc.json()["success"] is True

        # Check friends list
        r_friends = client.get(f"/api/v1/connections?user_id={user1_id}")
        friends = r_friends.json()["friends"]
        print("Tony Stark friends:", [f["connect_id"] for f in friends])
        assert len(friends) >= 1
        conv_id = friends[0]["conversation_id"]

        print("\n--- 9. User 2 Uploads an Attachment File ---")
        file_bytes = b"Sample confidential blueprint for Arc Reactor v2"
        r_upload = client.post(
            "/api/v1/files/upload",
            files={"file": ("blueprint.txt", io.BytesIO(file_bytes), "text/plain")}
        )
        print("File upload response:", r_upload.status_code, r_upload.json())
        assert r_upload.status_code == 200
        up_file = r_upload.json()
        assert up_file["file_name"] == "blueprint.txt"

        print("\n--- 10. User 2 Sends WhatsApp-style Message with Attachment ---")
        r_msg = client.post("/api/v1/messages/send", json={
            "conversation_id": conv_id,
            "sender_id": user2_id,
            "sender_name": user2["name"],
            "receiver_id": user1_id,
            "content": "Tony, check out this blueprint file!",
            "file_url": up_file["file_url"],
            "file_name": up_file["file_name"],
            "file_size": up_file["file_size"],
            "file_type": up_file["file_type"]
        })
        print("Message sent response:", r_msg.status_code, r_msg.json()["success"])
        assert r_msg.status_code == 200

        print("\n--- 11. User 1 Reads Chat Messages in Conversation ---")
        r_chat = client.get(f"/api/v1/messages/{conv_id}")
        print("Retrieved messages in conversation:", r_chat.status_code, len(r_chat.json()))
        assert r_chat.status_code == 200 and len(r_chat.json()) >= 1
        last_msg = r_chat.json()[-1]
        assert last_msg["file_name"] == "blueprint.txt"
        assert "Tony, check out this blueprint file!" in last_msg["content"]
        print("Last message attachment verified:", last_msg["file_name"], last_msg["file_size"])

        print("\n--- 12. Update Profile (Bio, Name, Status) ---")
        r_prof = client.put("/api/v1/auth/profile", json={
            "user_id": user1_id,
            "name": "Tony Stark (Genius, Billionaire)",
            "bio": "I am Iron Man. Building Vertex Connect SaaS.",
            "status": "online"
        })
        print("Profile updated:", r_prof.status_code, r_prof.json()["bio"])
        assert r_prof.status_code == 200
        assert "Iron Man" in r_prof.json()["bio"]

        print("\n=======================================================")
        print("🎉 ALL PHASE 2 TESTS PASSED WITH 100% SUCCESS! 🎉")
        print("=======================================================")

if __name__ == "__main__":
    run_tests()
