import json, os
from pathlib import Path

root = Path("data/lupin-airlines")
op = os.environ["OPERATION"]
payload = json.loads(os.environ["PAYLOAD"])
accounts = json.loads((root/"accounts.json").read_text())
bookings = json.loads((root/"bookings.json").read_text())

if op == "register":
    if any(x["username"] == payload["username"] for x in accounts):
        raise SystemExit("username already exists")
    accounts.append(payload["account"])
elif op == "book":
    account = next((x for x in accounts if x["username"] == payload["username"]), None)
    if not account:
        raise SystemExit("account not found")
    bookings.insert(0, payload["booking"])
    account["miles"] = int(account.get("miles", 0)) + int(payload.get("miles", 500))
elif op == "cancel":
    booking = next((x for x in bookings if x["bookingId"] == payload["bookingId"] and x["username"] == payload["username"]), None)
    if not booking or booking.get("status") == "Cancelled":
        raise SystemExit("booking not found")
    booking["status"] = "Cancelled"
    account = next((x for x in accounts if x["username"] == payload["username"]), None)
    if account:
        account["miles"] = max(0, int(account.get("miles", 0)) - int(booking.get("milesEarned", 500)))
else:
    raise SystemExit("unsupported operation")

(root/"accounts.json").write_text(json.dumps(accounts, indent=2) + "\n")
(root/"bookings.json").write_text(json.dumps(bookings, indent=2) + "\n")
