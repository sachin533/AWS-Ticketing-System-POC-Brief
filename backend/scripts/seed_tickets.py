"""Seed realistic machine-generated tickets into the EXISTING tickets-dev table.

SAFE BY DESIGN:
  - Only batch_puts NEW items (uuid ticketIds). Never deletes, never overwrites
    (uuid collision is practically impossible), never touches other tables.
  - Default mode is --dry-run (no AWS calls at all): prints sample tickets and
    the planned status/priority/category distributions.
  - --execute performs the inserts. Requires AWS credentials (see bottom); the
    script never asks for or stores secrets.

Schema matches backend/src/index.js createTicket + lib/validation.js:
  ticketId, title, description, status, priority, category,
  customerId (Cognito sub), customerEmail, assignee (email or null),
  attachments ([]), createdAt/updatedAt (ISO-8601).

Category values are restricted to the backend enum
(GENERAL/BILLING/TECHNICAL/ACCOUNT/OTHER); Sir's requested Login/Payment/Network
scenarios are expressed through realistic titles/descriptions mapped onto
ACCOUNT/BILLING/TECHNICAL so tickets stay editable via the API validation.

Usage:
  py seed_tickets.py --count 300 --dry-run
  py seed_tickets.py --count 300 --execute --region ap-southeast-2
  # assign first 15 tickets to a REAL customer sub so Customer view shows them:
  py seed_tickets.py --count 300 --execute --owner-sub <sub> --owner-email <email> --owner-count 15
"""
from __future__ import annotations

import argparse
import random
import sys
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

VALID_STATUS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
VALID_PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"]
VALID_CATEGORY = ["GENERAL", "BILLING", "TECHNICAL", "ACCOUNT", "OTHER"]

FIRST = ["Aarav", "Priya", "Rohan", "Sneha", "Vikram", "Ananya", "Karan", "Divya",
         "Arjun", "Meera", "Rahul", "Kavya", "Aditya", "Pooja", "Nikhil", "Riya",
         "Suresh", "Lakshmi", "Amit", "Neha", "Farhan", "Isha", "Gaurav", "Tara",
         "Manoj", "Kriti", "Sanjay", "Naina", "Vivek", "Asha", "Rohan", "Zara"]
LAST = ["Sharma", "Patel", "Iyer", "Gupta", "Mehta", "Nair", "Singh", "Reddy",
        "Khan", "Das", "Kulkarni", "Joshi", "Chopra", "Verma", "Rao", "Pillai"]
DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "example.com", "mail.com"]
AGENTS = ["agent.smith@example.com", "agent.jones@example.com",
          "support.lead@example.com", "agent.patel@example.com",
          "agent.wong@example.com", "agent.garcia@example.com"]
PRODUCTS = ["dashboard", "mobile app", "billing portal", "reports page",
            "settings page", "checkout flow", "API integration", "notification service"]
PLANS = ["Starter", "Growth", "Business", "Enterprise"]
BROWSERS = ["Chrome 126", "Firefox 128", "Safari 17", "Edge 126"]

# (category, title template, description template)
TEMPLATES = [
    ("ACCOUNT", "Cannot log in - password reset email never arrives",
     "Tried resetting the password for {email} three times over two days. No reset email in inbox or spam. Account may be locked. Need urgent access before payroll run."),
    ("ACCOUNT", "Account locked after too many login attempts",
     "Entered the wrong password a few times and now the account is locked. The unlock link says it expired. Please unlock {email} manually."),
    ("ACCOUNT", "Two-factor codes not received on phone",
     "2FA SMS codes stopped arriving since last week on number ending {phone}. Tried resending multiple times. Cannot access the {product}."),
    ("ACCOUNT", "Profile email change not saving",
     "Updated the profile email from {email} to a new address, the UI says saved, but confirmation still goes to the old address."),
    ("ACCOUNT", "Single sign-on login loops back to sign-in page",
     "Google SSO login succeeds but redirects back to the sign-in page in {browser}. Cleared cookies, same result on two machines."),
    ("BILLING", "Charged twice for the {plan} plan renewal",
     "Invoice shows two identical charges of {amount} on {date}. Bank confirms both debited. Request refund of the duplicate charge."),
    ("BILLING", "Invoice download shows 404 error",
     "Billing history lists invoice {inv} but clicking Download returns a 404. Need the PDF for tax filing this week."),
    ("BILLING", "Refund not received after cancellation",
     "Cancelled the {plan} subscription on {date} with a promised pro-rated refund of {amount}. 10 business days passed, nothing credited yet."),
    ("BILLING", "Payment failed but card is valid",
     "Card ending {card} is valid and has limit, yet the payment page reports failure with code {code}. Subscription is now past due."),
    ("BILLING", "Upgrade to {plan} plan did not apply features",
     "Paid for the {plan} upgrade yesterday. Receipt received, but the workspace still shows old limits and locked features."),
    ("TECHNICAL", "Dashboard returns 500 error on {product}",
     "Since this morning the {product} shows a 500 error after login. Tried {browser} and incognito. Error reference {code}. Blocks daily reporting."),
    ("TECHNICAL", "Page load time over 30 seconds on reports",
     "The monthly report with date filters takes 30+ seconds and often times out. Smaller ranges work. Started after the weekend release."),
    ("TECHNICAL", "Mobile app crashes on launch (Android 14)",
     "The Android app crashes immediately on launch after the latest update. Reinstalled twice. Device: Pixel 7, Android 14."),
    ("TECHNICAL", "Network timeout syncing offline changes",
     "Field team works offline; sync fails with network timeout errors even on strong Wi-Fi. About {n} records stuck on device."),
    ("TECHNICAL", "CSV export produces garbled characters",
     "Exported CSV from the {product} shows garbled text for customer names with accents. Tried Excel and Google Sheets, same issue."),
    ("TECHNICAL", "Webhook deliveries failing with 401",
     "Our {product} webhooks started failing with 401 responses two days ago. Secret was not rotated on our side. Delivery ID {code}."),
    ("GENERAL", "How to invite new team members to the workspace?",
     "Need to onboard {n} new teammates with viewer and editor roles. The invite button is greyed out for me - is this a permission issue?"),
    ("GENERAL", "Request: dark mode for the {product}",
     "Team works late hours and requests a dark mode for the {product}. Is this on the roadmap? Happy to join a beta."),
    ("GENERAL", "Where can I find audit logs for my workspace?",
     "Compliance review needs user login and settings-change history for the last 90 days. Cannot locate the audit log section."),
    ("GENERAL", "Feedback: confirmation emails land in spam",
     "Several teammates report booking confirmations going to spam. SPF/DKIM look fine from our side. Can you check sending reputation?"),
    ("OTHER", "Change registered company name on account",
     "Company renamed last month. Need invoices and the account profile updated from the old name to the new legal entity."),
    ("OTHER", "Delete my account and all associated data",
     "Please permanently delete the account {email} and all associated data per policy. Confirm once completed."),
    ("OTHER", "Timezone displays incorrectly in scheduled reports",
     "Scheduled reports show UTC timestamps instead of Asia/Kolkata. Account timezone is set correctly. Affects {n} recurring reports."),
]


def make_customers(rng, n=40):
    out = []
    for _ in range(n):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        local = name.lower().replace(" ", ".") + str(rng.randint(1, 99))
        out.append({"sub": str(uuid.uuid4()), "email": f"{local}@{rng.choice(DOMAINS)}",
                    "name": name})
    return out


def gen_ticket(rng, customers, now):
    cust = rng.choice(customers)
    cat, t, d = rng.choice(TEMPLATES)
    ctx = {"email": cust["email"], "phone": str(rng.randint(1000, 9999)),
           "product": rng.choice(PRODUCTS), "plan": rng.choice(PLANS),
           "browser": rng.choice(BROWSERS), "amount": f"${rng.randint(20, 900)}.00",
           "date": (now - timedelta(days=rng.randint(1, 100))).strftime("%Y-%m-%d"),
           "inv": f"INV-{rng.randint(10000, 99999)}", "card": str(rng.randint(1000, 9999)),
           "code": f"ERR-{rng.randint(1000, 9999)}", "n": rng.randint(2, 25)}
    r = rng.random()
    status = ("OPEN" if r < 0.30 else "IN_PROGRESS" if r < 0.55
              else "RESOLVED" if r < 0.80 else "CLOSED")
    r = rng.random()
    priority = ("LOW" if r < 0.20 else "MEDIUM" if r < 0.60
                else "HIGH" if r < 0.90 else "URGENT")
    created = now - timedelta(days=rng.randint(0, 120), hours=rng.randint(0, 23),
                              minutes=rng.randint(0, 59))
    age_h = max(1, int((now - created).total_seconds() // 3600))
    upd = (created if status == "OPEN"
           else created + timedelta(hours=rng.randint(1, min(age_h, 24 if status == "IN_PROGRESS" else age_h))))
    assignee = None
    if status in ("IN_PROGRESS", "RESOLVED", "CLOSED"):
        assignee = rng.choice(AGENTS)
    elif rng.random() < 0.25:
        assignee = rng.choice(AGENTS)
    return {
        "ticketId": str(uuid.uuid4()),
        "title": t.format(**ctx)[:200],
        "description": d.format(**ctx),
        "status": status, "priority": priority, "category": cat,
        "customerId": cust["sub"], "customerEmail": cust["email"],
        "assignee": assignee, "attachments": [],
        "createdAt": created.isoformat(timespec="seconds") + "Z",
        "updatedAt": upd.isoformat(timespec="seconds") + "Z",
    }


def validate(t):
    assert t["status"] in VALID_STATUS and t["priority"] in VALID_PRIORITY
    assert t["category"] in VALID_CATEGORY
    assert len(t["title"]) >= 3 and len(t["description"]) >= 5
    assert t["updatedAt"] >= t["createdAt"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=300)
    ap.add_argument("--table", default="tickets-dev")
    ap.add_argument("--region", default="ap-southeast-2")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dry-run", action="store_true", default=True)
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--owner-sub", default=None)
    ap.add_argument("--owner-email", default=None)
    ap.add_argument("--owner-count", type=int, default=15)
    a = ap.parse_args()

    rng = random.Random(a.seed)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    customers = make_customers(rng)
    tickets = [gen_ticket(rng, customers, now) for _ in range(a.count)]
    for i in range(min(a.owner_count, len(tickets))):
        if a.owner_sub:
            tickets[i]["customerId"] = a.owner_sub
        if a.owner_email:
            tickets[i]["customerEmail"] = a.owner_email
    for t in tickets:
        validate(t)

    print(f"Planned inserts: {len(tickets)} -> table '{a.table}' ({a.region})")
    print("Status:  ", dict(Counter(t['status'] for t in tickets)))
    print("Priority:", dict(Counter(t['priority'] for t in tickets)))
    print("Category:", dict(Counter(t['category'] for t in tickets)))
    print("Customers:", len({t['customerId'] for t in tickets}),
          "| assigned:", sum(1 for t in tickets if t['assignee']))
    print("\nSample:")
    for t in tickets[:3]:
        print(f"  [{t['status']}/{t['priority']}/{t['category']}] {t['title']}")
        print(f"    {t['description'][:110]}... ({t['customerEmail']})")

    if not a.execute:
        print("\nDRY-RUN: no AWS calls made. Re-run with --execute to insert.")
        return 0
    try:
        import boto3
    except ImportError:
        print("boto3 not installed: py -m pip install boto3", file=sys.stderr)
        return 2
    sess = boto3.Session(profile_name=a.profile, region_name=a.region) if a.profile \
        else boto3.Session(region_name=a.region)
    table = sess.resource("dynamodb").Table(a.table)
    table.load()
    print(f"Table OK: {table.table_status} (existing items untouched)")
    with table.batch_writer() as b:
        for i, t in enumerate(tickets, 1):
            b.put_item(Item=t)
            if i % 100 == 0:
                print(f"  ...{i}/{len(tickets)}")
    print(f"Inserted {len(tickets)} tickets into {a.table}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
