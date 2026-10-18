"""KhorshidCard (Azuri Iran) API: SMS-code login, lease-to-own kits, charge cards, support tickets, ops panel."""
import math
import os
import random
import re
import secrets
import sqlite3
import time
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timedelta
from typing import Literal

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

DB_PATH = os.environ.get("DB_PATH", "khorshid.db")
DEMO = os.environ.get("DEMO", "1") == "1"  # returns login codes in responses and enables demo charge cards
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "0") == "1"

# Prices in million toman, from the business plan (Pricing section).
PLANS = [
    {"id": "basic", "watts": 600, "battery_kwh": 1.2, "lamps": 4, "down": 15, "monthly": 3.5, "months": 24},
    {"id": "standard", "watts": 1000, "battery_kwh": 2.4, "lamps": 6, "down": 25, "monthly": 5.5, "months": 27},
    {"id": "business", "watts": 2000, "battery_kwh": 5.0, "lamps": 10, "down": 45, "monthly": 10.5, "months": 30},
]
PLAN = {p["id"]: p for p in PLANS}
WEEKS_PER_MONTH = 4.345
PROVINCES = ["sistan", "kerman", "hormozgan", "bushehr", "fars", "yazd", "south_khorasan"]
FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

SCHEMA = """
create table if not exists users(id integer primary key, phone text unique not null, name text default '',
  role text default 'customer', province text, address text, created text);
create table if not exists kits(id integer primary key, serial text unique, user_id int unique, plan text,
  status text default 'pending', credit_until text, weeks_paid real default 0, created text, installed text);
create table if not exists codes(code text primary key, weeks int, created text, used_by int, used_at text);
create table if not exists tx(id integer primary key, user_id int, at text, weeks int, amount real, code text);
create table if not exists tickets(id integer primary key, user_id int, subject text, body text,
  status text default 'open', reply text, created text, updated text);
create table if not exists sessions(token text primary key, user_id int, created text);
create table if not exists otps(phone text primary key, code text, sent text, tries int default 0);
"""

app = FastAPI(title="KhorshidCard API")


def now():
    return datetime.now()


def iso(t):
    return t.isoformat(timespec="seconds")


def connect():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def get_db():
    c = connect()
    try:
        yield c
        c.commit()
    finally:
        c.close()


def week_price(plan):
    return round(PLAN[plan]["monthly"] / WEEKS_PER_MONTH, 2)


def luhn_ok(code: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(code)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def make_code() -> str:
    body = "".join(secrets.choice("0123456789") for _ in range(11))
    return next(body + d for d in "0123456789" if luhn_ok(body + d))


def new_code(c, weeks):
    while True:
        code = make_code()
        try:
            c.execute("insert into codes(code, weeks, created) values (?,?,?)", (code, weeks, iso(now())))
            return code
        except sqlite3.IntegrityError:
            continue


def norm_phone(p: str) -> str:
    p = re.sub(r"[\s-]", "", p.translate(FA_DIGITS))
    if p.startswith("+98"):
        p = "0" + p[3:]
    elif p.startswith("98") and len(p) == 12:
        p = "0" + p[2:]
    if not re.fullmatch(r"09\d{9}", p):
        raise HTTPException(422, "invalid_phone")
    return p


def kit_view(k):
    plan = PLAN[k["plan"]]
    months = int(k["weeks_paid"] / WEEKS_PER_MONTH)
    left = 0
    if k["status"] == "pending":
        status = "pending"
    elif months >= plan["months"]:
        status = "owned"  # lease-to-own: fully paid kits never lock
    else:
        left = max(int((datetime.fromisoformat(k["credit_until"]) - now()).total_seconds()), 0)
        status = "active" if left else "expired"
    return {"serial": k["serial"], "plan": plan, "status": status, "credit_seconds": left,
            "months_paid": min(months, plan["months"]), "created": k["created"], "installed": k["installed"]}


def current_user(session: str | None = Cookie(None), c=Depends(get_db)):
    since = iso(now() - timedelta(days=30))
    row = session and c.execute(
        "select u.* from sessions s join users u on u.id = s.user_id where s.token = ? and s.created > ?",
        (session, since)).fetchone()
    if not row:
        raise HTTPException(401, "auth_required")
    return row


def admin_user(u=Depends(current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "forbidden")
    return u


def user_kit(c, uid):
    return c.execute("select * from kits where user_id = ?", (uid,)).fetchone()


# ---------- public ----------

@app.get("/api/health")
def health():
    return {"ok": True, "demo": DEMO}


@app.get("/api/plans")
def plans():
    return PLANS


# ---------- auth ----------

class OtpIn(BaseModel):
    phone: str = Field(max_length=20)


class VerifyIn(BaseModel):
    phone: str = Field(max_length=20)
    code: str = Field(min_length=5, max_length=5)
    name: str | None = Field(None, max_length=60)


@app.post("/api/auth/otp")
def request_otp(body: OtpIn, c=Depends(get_db)):
    phone = norm_phone(body.phone)
    row = c.execute("select sent from otps where phone = ?", (phone,)).fetchone()
    if row and row["sent"] > iso(now() - timedelta(seconds=60)):
        raise HTTPException(429, "wait")
    code = f"{secrets.randbelow(10 ** 5):05d}"
    c.execute("replace into otps(phone, code, sent, tries) values (?,?,?,0)", (phone, code, iso(now())))
    # ponytail: no SMS gateway wired yet; DEMO returns the code, production needs an SMS provider call here.
    is_new = not c.execute("select 1 from users where phone = ?", (phone,)).fetchone()
    return {"is_new": is_new, **({"demo_code": code} if DEMO else {})}


@app.post("/api/auth/verify")
def verify_otp(body: VerifyIn, response: Response, c=Depends(get_db)):
    phone = norm_phone(body.phone)
    row = c.execute("select * from otps where phone = ?", (phone,)).fetchone()
    if not row or row["sent"] < iso(now() - timedelta(minutes=2)) or row["tries"] >= 5:
        raise HTTPException(410, "code_expired")
    if not secrets.compare_digest(row["code"], body.code.translate(FA_DIGITS)):
        c.execute("update otps set tries = tries + 1 where phone = ?", (phone,))
        c.commit()
        raise HTTPException(401, "wrong_code")
    c.execute("delete from otps where phone = ?", (phone,))
    user = c.execute("select * from users where phone = ?", (phone,)).fetchone()
    if user:
        uid, role = user["id"], user["role"]
    else:
        uid = c.execute("insert into users(phone, name, created) values (?,?,?)",
                        (phone, (body.name or "").strip(), iso(now()))).lastrowid
        role = "customer"
    token = secrets.token_urlsafe(32)
    c.execute("insert into sessions values (?,?,?)", (token, uid, iso(now())))
    response.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=COOKIE_SECURE)
    return {"role": role}


@app.post("/api/auth/logout")
def logout(response: Response, session: str | None = Cookie(None), c=Depends(get_db)):
    c.execute("delete from sessions where token = ?", (session,))
    response.delete_cookie("session")
    return {"ok": True}


@app.get("/api/me")
def me(u=Depends(current_user), c=Depends(get_db)):
    kit = user_kit(c, u["id"])
    return {"id": u["id"], "phone": u["phone"], "name": u["name"], "role": u["role"], "province": u["province"],
            "kit": kit_view(kit) if kit else None, "demo": DEMO}


# ---------- customer ----------

class OrderIn(BaseModel):
    plan: str
    province: str
    address: str = Field(min_length=5, max_length=300)
    name: str | None = Field(None, max_length=60)


@app.post("/api/kit/order")
def order_kit(body: OrderIn, u=Depends(current_user), c=Depends(get_db)):
    if body.plan not in PLAN or body.province not in PROVINCES:
        raise HTTPException(422, "invalid_order")
    if user_kit(c, u["id"]):
        raise HTTPException(409, "has_kit")
    serial = f"KC-{1000 + u['id']}-{secrets.randbelow(9000) + 1000}"
    c.execute("insert into kits(serial, user_id, plan, created) values (?,?,?,?)", (serial, u["id"], body.plan, iso(now())))
    c.execute("update users set province = ?, address = ?, name = coalesce(nullif(?, ''), name) where id = ?",
              (body.province, body.address.strip(), (body.name or "").strip(), u["id"]))
    return {"serial": serial}


def need_live_kit(c, uid):
    k = user_kit(c, uid)
    if not k or k["status"] == "pending":
        raise HTTPException(404, "no_kit")
    return k


@app.get("/api/device")
def device(u=Depends(current_user), c=Depends(get_db)):
    k = need_live_kit(c, u["id"])
    v = kit_view(k)
    t = now()
    h = t.hour + t.minute / 60
    on = v["status"] in ("active", "owned")
    solar = int(v["plan"]["watts"] * 0.85 * math.sin(math.pi * (h - 6) / 13) * random.uniform(0.9, 1)) if 6 <= h <= 19 else 0
    # Battery follows the sun: fuller in the afternoon, draining overnight.
    battery = int(55 + 40 * math.sin(math.pi * (h - 8) / 24) + random.uniform(-1, 1))
    return {**v, "active": on, "battery": max(5, min(battery, 100)), "solar_w": solar,
            "load_w": random.randint(60, 180) if on else 0,
            "temp_c": round(28 + solar / 120 + random.uniform(-0.5, 0.5), 1),
            "co2_saved_kg": int(k["weeks_paid"] * 9.5), "updated": iso(t)}


@app.get("/api/energy")
def energy(u=Depends(current_user), c=Depends(get_db)):
    k = need_live_kit(c, u["id"])
    today = now().date()
    rng = random.Random(f"{k['serial']}{today}")  # stable per kit per day
    peak = PLAN[k["plan"]]["watts"] / 1000
    return [{"date": (today - timedelta(days=6 - i)).isoformat(), "kwh": round(rng.uniform(2.1, 4.6) * peak, 2)}
            for i in range(7)]


@app.get("/api/transactions")
def transactions(u=Depends(current_user), c=Depends(get_db)):
    rows = c.execute("select id, at, weeks, amount, code from tx where user_id = ? order by at desc limit 20", (u["id"],))
    return [dict(r) for r in rows]


class TopUpIn(BaseModel):
    code: str = Field(min_length=12, max_length=19)


FAILS: dict[int, list[float]] = defaultdict(list)  # ponytail: per-process brute-force guard, move to Redis if scaled out


@app.post("/api/topup")
def topup(body: TopUpIn, u=Depends(current_user), c=Depends(get_db)):
    recent = [t for t in FAILS[u["id"]] if t > time.time() - 600]
    FAILS[u["id"]] = recent
    if len(recent) >= 10:
        raise HTTPException(429, "too_many_attempts")
    k = need_live_kit(c, u["id"])
    if kit_view(k)["status"] == "owned":
        raise HTTPException(409, "owned")
    code = re.sub(r"[\s-]", "", body.code.translate(FA_DIGITS))
    card = code.isdigit() and len(code) == 12 and luhn_ok(code) and \
        c.execute("select * from codes where code = ?", (code,)).fetchone()
    if not card:
        recent.append(time.time())
        raise HTTPException(422, "invalid_code")
    t = now()
    # Conditional update makes redeeming atomic: a card can only ever flip to used once.
    if not c.execute("update codes set used_by = ?, used_at = ? where code = ? and used_by is null",
                     (u["id"], iso(t), code)).rowcount:
        raise HTTPException(409, "used_code")
    until = max(datetime.fromisoformat(k["credit_until"]), t) + timedelta(weeks=card["weeks"])
    c.execute("update kits set credit_until = ?, weeks_paid = weeks_paid + ? where id = ?", (iso(until), card["weeks"], k["id"]))
    tx = {"at": iso(t), "weeks": card["weeks"], "amount": round(week_price(k["plan"]) * card["weeks"], 2), "code": f"•••• {code[-4:]}"}
    tx["id"] = c.execute("insert into tx(user_id, at, weeks, amount, code) values (?,?,?,?,?)",
                         (u["id"], tx["at"], tx["weeks"], tx["amount"], tx["code"])).lastrowid
    return {"tx": tx, "credit_seconds": int((until - t).total_seconds())}


class DemoCodeIn(BaseModel):
    weeks: int = Field(1, ge=1, le=12)


@app.post("/api/demo-code")
def demo_code(body: DemoCodeIn, c=Depends(get_db)):
    if not DEMO:
        raise HTTPException(404, "not_found")
    return {"code": new_code(c, body.weeks), "weeks": body.weeks}


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=3, max_length=2000)


@app.get("/api/tickets")
def my_tickets(u=Depends(current_user), c=Depends(get_db)):
    rows = c.execute("select id, subject, body, status, reply, created, updated from tickets where user_id = ? order by id desc",
                     (u["id"],))
    return [dict(r) for r in rows]


@app.post("/api/tickets")
def new_ticket(body: TicketIn, u=Depends(current_user), c=Depends(get_db)):
    t = iso(now())
    tid = c.execute("insert into tickets(user_id, subject, body, created, updated) values (?,?,?,?,?)",
                    (u["id"], body.subject.strip(), body.body.strip(), t, t)).lastrowid
    return {"id": tid}


# ---------- ops panel ----------

@app.get("/api/admin/stats")
def stats(_=Depends(admin_user), c=Depends(get_db)):
    kits = [kit_view(k) for k in c.execute("select * from kits")]
    st = {s: sum(k["status"] == s for k in kits) for s in ("pending", "active", "expired", "owned")}
    installed = len(kits) - st["pending"]
    t = now()
    rev = c.execute("select coalesce(sum(amount), 0) from tx where at >= ?", (iso(t - timedelta(days=30)),)).fetchone()[0]
    months = c.execute("select substr(at, 1, 7) m, round(sum(amount), 1) a from tx where at >= ? group by m order by m",
                       (iso(t - timedelta(days=183)),))
    prov = c.execute("select province, count(*) n from users where role = 'customer' and province is not null "
                     "group by province order by n desc")
    return {
        "customers": c.execute("select count(*) from users where role = 'customer'").fetchone()[0],
        "kits": len(kits), "status": st,
        "collection_rate": round(100 * (st["active"] + st["owned"]) / installed, 1) if installed else 0,
        "revenue_30d": round(rev, 1),
        "revenue_by_month": [{"month": m, "amount": a} for m, a in months],
        "provinces": [{"id": p, "count": n} for p, n in prov],
        "open_tickets": c.execute("select count(*) from tickets where status = 'open'").fetchone()[0],
    }


@app.get("/api/admin/customers")
def customers(status: str = "", q: str = "", _=Depends(admin_user), c=Depends(get_db)):
    rows = c.execute(
        "select u.id uid, u.name, u.phone, u.province, k.serial, k.plan, k.status, k.credit_until, k.weeks_paid, "
        "k.created, k.installed from users u left join kits k on k.user_id = u.id where u.role = 'customer' order by u.id desc")
    q, qd = q.strip(), q.strip().translate(FA_DIGITS)
    out = []
    for r in rows:
        kit = kit_view(r) if r["serial"] else None
        if status and (kit or {}).get("status") != status:
            continue
        if q and q not in r["name"] and qd not in r["phone"]:
            continue
        out.append({"id": r["uid"], "name": r["name"], "phone": r["phone"], "province": r["province"], "kit": kit})
    return out[:200]


@app.post("/api/admin/kits/{serial}/install")
def install_kit(serial: str, _=Depends(admin_user), c=Depends(get_db)):
    t = now()
    # First week of power is included with the down payment.
    if not c.execute("update kits set status = 'active', installed = ?, credit_until = ? where serial = ? and status = 'pending'",
                     (iso(t), iso(t + timedelta(days=7)), serial)).rowcount:
        raise HTTPException(404, "not_pending")
    return {"ok": True}


class CodesIn(BaseModel):
    count: int = Field(ge=1, le=100)
    weeks: int = Field(1, ge=1, le=12)


@app.post("/api/admin/codes")
def make_codes(body: CodesIn, _=Depends(admin_user), c=Depends(get_db)):
    return {"codes": [new_code(c, body.weeks) for _ in range(body.count)], "weeks": body.weeks}


@app.get("/api/admin/tickets")
def all_tickets(_=Depends(admin_user), c=Depends(get_db)):
    rows = c.execute("select t.id, t.subject, t.body, t.status, t.reply, t.created, t.updated, u.name, u.phone "
                     "from tickets t join users u on u.id = t.user_id order by t.status = 'open' desc, t.id desc limit 100")
    return [dict(r) for r in rows]


class TicketUpdate(BaseModel):
    status: Literal["open", "answered", "closed"]
    reply: str | None = Field(None, max_length=2000)


@app.patch("/api/admin/tickets/{tid}")
def update_ticket(tid: int, body: TicketUpdate, _=Depends(admin_user), c=Depends(get_db)):
    if not c.execute("update tickets set status = ?, reply = coalesce(nullif(?, ''), reply), updated = ? where id = ?",
                     (body.status, (body.reply or "").strip(), iso(now()), tid)).rowcount:
        raise HTTPException(404, "not_found")
    return {"ok": True}


# ---------- demo seed ----------

NAMES = ["مریم احمدی", "علی رضایی", "زهرا محمدی", "حسین کریمی", "فاطمه حسینی", "رضا موسوی", "نرگس جعفری", "محمد صادقی",
         "سمیه رحیمی", "امیر نوری", "لیلا کاظمی", "مهدی یوسفی", "کبری بلوچ", "عبدالله ریگی", "پروین شهرکی", "یاسر نارویی"]


def seed(c):
    rng, t = random.Random(49), now()
    c.execute("insert into users(phone, name, role, created) values ('09120000001', 'مدیر سامانه', 'admin', ?)", (iso(t),))
    people = [("09120000000", "مریم احمدی", "kerman", "standard", 48, t + timedelta(days=5, hours=7))]
    for i in range(36):
        plan = rng.choices(["basic", "standard", "business"], [5, 4, 2])[0]
        r = rng.random()
        credit = None if r < .12 else t - timedelta(days=rng.uniform(1, 20)) if r < .27 else t + timedelta(days=rng.uniform(.3, 25))
        weeks = PLAN[plan]["months"] * WEEKS_PER_MONTH + 1 if i < 2 else rng.randint(4, 90)
        people.append((f"0913{i:07d}", rng.choice(NAMES), rng.choice(PROVINCES), plan, weeks, credit))
    for phone, name, prov, plan, weeks, credit in people:
        start = t - timedelta(days=weeks * 7)
        uid = c.execute("insert into users(phone, name, province, address, created) values (?,?,?,?,?)",
                        (phone, name, prov, "—", iso(start))).lastrowid
        pending = credit is None
        c.execute("insert into kits(serial, user_id, plan, status, credit_until, weeks_paid, created, installed) "
                  "values (?,?,?,?,?,?,?,?)",
                  (f"KC-{1000 + uid}-{rng.randint(1000, 9999)}", uid, plan, "pending" if pending else "active",
                   None if pending else iso(credit), 0 if pending else weeks,
                   iso(start - timedelta(days=3)), None if pending else iso(start)))
        if pending:
            continue
        d = rng.uniform(0, 7) + max((t - credit).days, 0)
        while d < min(180, weeks * 7):
            c.execute("insert into tx(user_id, at, weeks, amount, code) values (?,?,?,?,?)",
                      (uid, iso(t - timedelta(days=d)), 1, week_price(plan), f"•••• {rng.randint(1000, 9999)}"))
            d += rng.uniform(6, 9)
    for uid, subject, body, reply in [
        (2, "چراغ باتری قرمز است", "از دیروز عصر چراغ باتری قرمز شده است.", None),
        (4, "درخواست جابه‌جایی پنل", "می‌خواهم پنل را روی سقف انباری نصب کنم.", "همکار ما فردا برای هماهنگی تماس می‌گیرد."),
        (7, "کد کارت شارژ پذیرفته نمی‌شود", "کد را وارد می‌کنم اما پیام خطا می‌دهد.", None),
    ]:
        c.execute("insert into tickets(user_id, subject, body, status, reply, created, updated) values (?,?,?,?,?,?,?)",
                  (uid, subject, body, "answered" if reply else "open", reply, iso(t - timedelta(hours=uid * 5)), iso(t)))


with closing(connect()) as _c:
    _c.executescript(SCHEMA)
    if not _c.execute("select 1 from users").fetchone():
        seed(_c)
    _c.commit()
