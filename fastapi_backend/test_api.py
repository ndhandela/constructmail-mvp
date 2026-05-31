"""
ConstructMail Intelligence — FastAPI endpoint test suite
Run from fastapi_backend/ with the server already running on :3001:
    python test_api.py
"""

import requests
import json
import sys
import time

BASE = "http://localhost:3001"
PASS = "✅"
FAIL = "❌"
SKIP = "⚠️ "

results = []


def test(name, method, path, expected_status=200, json_body=None, params=None, check_keys=None):
    try:
        r = requests.request(method, BASE + path, json=json_body, params=params, timeout=30)
        ok = r.status_code == expected_status
        body = {}
        try:
            body = r.json()
        except Exception:
            pass

        key_ok = True
        if check_keys and ok:
            for k in check_keys:
                if k not in body:
                    key_ok = False
                    break

        passed = ok and key_ok
        icon = PASS if passed else FAIL
        results.append((name, passed, r.status_code, expected_status))
        print(f"  {icon}  {name:<45}  {r.status_code}")
        if not passed:
            snippet = json.dumps(body)[:200]
            print(f"       └─ {snippet}")
        return body
    except requests.exceptions.ConnectionError:
        results.append((name, False, "NO_CONN", expected_status))
        print(f"  {FAIL}  {name:<45}  CONNECTION REFUSED — is the server running?")
        return {}
    except Exception as e:
        results.append((name, False, "ERR", expected_status))
        print(f"  {FAIL}  {name:<45}  {e}")
        return {}


# ─────────────────────────────────────────────
print("\n━━━ HEALTH & ROOT ━━━")
test("GET  /",                   "GET",  "/",           200, check_keys=["message"])
test("GET  /api/health",         "GET",  "/api/health", 200, check_keys=["status"])

# ─────────────────────────────────────────────
print("\n━━━ AUTH — register + login ━━━")
ts = int(time.time())
email = f"testuser_{ts}@example.com"
password = "TestPass123!"

reg = test("POST /api/auth/register",     "POST", "/api/auth/register", 200,
           json_body={"fullName": "Test User", "email": email, "company": "ACME", "role": "GC", "password": password},
           check_keys=["userId"])

user_id = reg.get("userId")

test("POST /api/auth/register (dup)",     "POST", "/api/auth/register", 400,
     json_body={"fullName": "Test User", "email": email, "company": "ACME", "role": "GC", "password": password})

test("POST /api/auth/login",              "POST", "/api/auth/login", 200,
     json_body={"email": email, "password": password},
     check_keys=["userId"])

test("POST /api/auth/login (bad pw)",     "POST", "/api/auth/login", 401,
     json_body={"email": email, "password": "wrongpassword"})

test("GET  /api/auth/me",                 "GET",  "/api/auth/me", 200,
     params={"userId": user_id}, check_keys=["email"])

test("POST /api/auth/forgot-password",    "POST", "/api/auth/forgot-password", 200,
     json_body={"email": email})

test("POST /api/auth/send-magic-link",    "POST", "/api/auth/send-magic-link", 200,
     json_body={"email": email})

# ─────────────────────────────────────────────
print("\n━━━ AI ENDPOINTS ━━━")
sample_email = """
From: John Smith <john@contractor.com>
To: Sarah Lee <sarah@gc.com>
Subject: RFI - Structural clash at Grid B4

Hi Sarah,
We found a clash between the MEP duct and structural beam at Grid B4, Level 3.
The duct needs to be rerouted before concrete pour on Friday.
John needs to submit an RFI by Wednesday. Budget impact is TBD.
"""

sum_resp = test("POST /api/summarize",       "POST", "/api/summarize", 200,
                json_body={"emailText": sample_email, "userId": user_id},
                check_keys=["summary"])

test("POST /api/extract-actions",            "POST", "/api/extract-actions", 200,
     json_body={"emailText": sample_email, "userId": user_id})

test("POST /api/detect-signals",             "POST", "/api/detect-signals", 200,
     json_body={"emailText": sample_email, "userId": user_id})

test("POST /api/process-meeting",            "POST", "/api/process-meeting", 200,
     json_body={"notesText": "Meeting: John, Sarah, Mike. Decided to reroute duct. John to submit RFI by Wed.", "userId": user_id},
     check_keys=["summary"])

test("GET  /api/recent-summaries",           "GET",  "/api/recent-summaries", 200, params={"userId": user_id})
test("GET  /api/open-actions",               "GET",  "/api/open-actions",     200, params={"userId": user_id})
test("GET  /api/recent-signals",             "GET",  "/api/recent-signals",   200, params={"userId": user_id})

# ─────────────────────────────────────────────
print("\n━━━ CLASH ━━━")
test("POST /api/clash/analyze",    "POST", "/api/clash/analyze", 200,
     json_body={"summary": {"total": 10, "New": 3, "Active": 5, "Reviewed": 2, "Approved": 0, "Resolved": 0, "type": "Hard", "tolerance": "0.001"},
                "topClashes": ["Duct vs Beam at B4 L3", "Pipe vs Column at C2"], "testName": "Test 1"},
     check_keys=["analysis"])

test("POST /api/clash/draft-rfi",  "POST", "/api/clash/draft-rfi", 200,
     json_body={"clashName": "Clash-001", "status": "New", "distance": "0.3",
                "item1": {"itemName": "HVAC Duct", "elementId": "A1", "layer": "MEP"},
                "item2": {"itemName": "Steel Beam", "elementId": "B2", "layer": "Structural"},
                "clashPoint": "Grid B4 Level 3", "discipline": "MEP", "priority": "High"},
     check_keys=["description"])

test("GET  /api/clash/assignments", "GET", "/api/clash/assignments", 200,
     params={"userId": str(user_id), "projectKey": "proj-001"})

test("POST /api/clash/assignments", "POST", "/api/clash/assignments", 200,
     json_body={"userId": str(user_id), "projectKey": "proj-001", "clashName": "Clash-001",
                "assignedTo": "John", "discipline": "MEP", "status": "open"})

test("POST /api/clash/reports",    "POST", "/api/clash/reports", 200,
     json_body={"userId": str(user_id), "testName": "Test 1", "fileName": "report.html",
                "summary": {"total": 10, "New": 3, "Active": 5, "Reviewed": 2, "Critical": 1, "High": 3}})

test("GET  /api/clash/reports",    "GET",  "/api/clash/reports", 200, params={"userId": str(user_id)})

# ─────────────────────────────────────────────
print("\n━━━ VENDORS ━━━")
v_resp = test("POST /api/vendors",          "POST", "/api/vendors", 200,
              json_body={"name": f"TestVendor_{ts}", "trade": "Electrical",
                         "phone": "555-1234", "email": "vendor@test.com",
                         "city": "Dallas", "state": "TX"},
              check_keys=["vendor"])

vendor_id = v_resp.get("vendor", {}).get("id")

test("GET  /api/vendors",                   "GET",  "/api/vendors", 200, check_keys=["vendors"])
test("GET  /api/vendors (search)",          "GET",  "/api/vendors", 200, params={"trade": "Electrical"})

if vendor_id:
    test("GET  /api/vendors/:id",           "GET",  f"/api/vendors/{vendor_id}", 200, check_keys=["vendor"])
    test("PUT  /api/vendors/:id",           "PUT",  f"/api/vendors/{vendor_id}", 200,
         json_body={"city": "Fort Worth"})
    test("POST /api/vendors/:id/reviews",   "POST", f"/api/vendors/{vendor_id}/reviews", 200,
         json_body={"userId": user_id, "rating_reliability": 4, "rating_cost": 3,
                    "rating_quality": 5, "rating_communication": 4, "rating_insurance": 3,
                    "comment": "Solid work"})
    test("GET  /api/vendors/:id/reviews",   "GET",  f"/api/vendors/{vendor_id}/reviews", 200)

# ─────────────────────────────────────────────
print("\n━━━ PROCORE ━━━")
test("GET  /api/procore/status",   "GET", "/api/procore/status", 200,
     params={"userId": str(user_id)}, check_keys=["connected"])

# ─────────────────────────────────────────────
print("\n━━━ ADMIN ━━━")
admin_resp = test("POST /api/admin/auth/login (bad)", "POST", "/api/admin/auth/login", 401,
                  json_body={"email": "notanadmin@x.com", "password": "wrong"})

# ─────────────────────────────────────────────
print("\n━━━ MISC ━━━")
test("GET  /api/debug/user-data/:id", "GET", f"/api/debug/user-data/{user_id}", 200, check_keys=["user"])

# ─────────────────────────────────────────────
print("\n" + "━" * 60)
passed = sum(1 for _, p, *_ in results if p)
total  = len(results)
failed = [(n, got, exp) for n, p, got, exp in results if not p]

print(f"  Results: {passed}/{total} passed\n")
if failed:
    print("  Failed tests:")
    for n, got, exp in failed:
        print(f"    {FAIL}  {n}  (got {got}, expected {exp})")
else:
    print("  All tests passed! 🎉")
print()

sys.exit(0 if not failed else 1)
