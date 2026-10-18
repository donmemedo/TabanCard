import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from main import app, luhn_ok, make_code  # noqa: E402


def login(phone, name=None):
    c = TestClient(app)
    code = c.post("/api/auth/otp", json={"phone": phone}).json()["demo_code"]
    r = c.post("/api/auth/verify", json={"phone": phone, "code": code, "name": name})
    assert r.status_code == 200, r.text
    return c


def test_luhn():
    assert luhn_ok("79927398713")
    assert not luhn_ok("79927398710")
    assert all(luhn_ok(make_code()) for _ in range(50))


def test_auth_guards():
    c = TestClient(app)
    assert c.get("/api/me").status_code == 401
    assert c.post("/api/auth/otp", json={"phone": "12345"}).status_code == 422
    assert c.post("/api/auth/otp", json={"phone": "09350000000"}).status_code == 200
    assert c.post("/api/auth/otp", json={"phone": "09350000000"}).status_code == 429  # resend throttle
    for _ in range(5):
        assert c.post("/api/auth/verify", json={"phone": "09350000000", "code": "xxxxx"}).status_code == 401
    assert c.post("/api/auth/verify", json={"phone": "09350000000", "code": "00000"}).status_code == 410  # locked out


def test_topup_flow():
    c = login("۰۹۱۲۰۰۰۰۰۰۰")  # Persian digits are normalised
    before = c.get("/api/me").json()["kit"]["credit_seconds"]
    code = c.post("/api/demo-code", json={"weeks": 2}).json()["code"]
    r = c.post("/api/topup", json={"code": f"{code[:4]}-{code[4:8]}-{code[8:]}"})
    assert r.status_code == 200, r.text
    assert r.json()["credit_seconds"] >= before + 14 * 86400 - 5
    assert c.post("/api/topup", json={"code": code}).status_code == 409
    assert c.post("/api/topup", json={"code": make_code()}).status_code == 422  # valid checksum, never issued
    assert c.get("/api/transactions").json()[0]["weeks"] == 2
    assert c.get("/api/device").json()["active"]


def test_order_install_and_admin():
    c = login("09351112233", "تست")
    assert c.get("/api/me").json()["kit"] is None
    assert c.get("/api/admin/stats").status_code == 403
    assert c.post("/api/kit/order", json={"plan": "basic", "province": "yazd", "address": "روستای نمونه"}).status_code == 200
    kit = c.get("/api/me").json()["kit"]
    assert kit["status"] == "pending"
    assert c.get("/api/device").status_code == 404
    assert c.post("/api/tickets", json={"subject": "سوال", "body": "زمان نصب؟"}).status_code == 200

    admin = login("09120000001")
    stats = admin.get("/api/admin/stats").json()
    assert 0 < stats["collection_rate"] <= 100 and stats["status"]["pending"] >= 1
    assert admin.post(f"/api/admin/kits/{kit['serial']}/install").status_code == 200
    assert c.get("/api/me").json()["kit"]["status"] == "active"
    tid = admin.get("/api/admin/tickets").json()[0]["id"]
    assert admin.patch(f"/api/admin/tickets/{tid}", json={"status": "answered", "reply": "فردا"}).status_code == 200
    assert c.get("/api/tickets").json()[0]["reply"] == "فردا"
    codes = admin.post("/api/admin/codes", json={"count": 3, "weeks": 4}).json()["codes"]
    assert len(set(codes)) == 3 and all(luhn_ok(x) for x in codes)
    assert admin.get("/api/admin/customers", params={"status": "pending"}).json() is not None
