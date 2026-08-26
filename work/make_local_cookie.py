import base64
import hashlib
import hmac
import json
import time

secret = b"local-development-only-secret-control-sku-2026"
payload = {
    "userId": "ignacio@grupo-aftermarket.com",
    "email": "ignacio@grupo-aftermarket.com",
    "displayName": "Ignacio Galarza",
    "picture": None,
    "expiresAt": int(time.time() * 1000) + 3_600_000,
}
encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
signature = base64.urlsafe_b64encode(hmac.new(secret, encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
print(f"bam_google_session={encoded}.{signature}")
