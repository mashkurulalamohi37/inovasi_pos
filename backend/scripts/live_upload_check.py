"""Manual smoke check for product image upload against a RUNNING server.

Run explicitly:  python backend/scripts/live_upload_check.py
Requires a live backend on 127.0.0.1:9200 and the seeded demo tenant.

This is NOT a pytest test and must not live under backend/tests/. It performs a
live HTTP call and calls sys.exit() at import time; while it sat in tests/,
pytest aborted collection with an INTERNALERROR and ran ZERO tests. The same
endpoint is covered properly by tests/test_upload_image.py via TestClient.
"""

import json
import urllib.request
import urllib.error
import sys

# 1. Login
login_url = "http://127.0.0.1:9200/api/v1/auth/login"
login_data = json.dumps({"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"}).encode("utf-8")
req = urllib.request.Request(
    login_url,
    data=login_data,
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req) as response:
        login_res = json.loads(response.read().decode("utf-8"))
except Exception as e:
    print(f"Login failed: {e}")
    sys.exit(1)

token = login_res["access_token"]
print("Login successful!")

# 2. Upload using multipart manually
boundary = "====boundary===="
file_data = b"fake image data"
body = (
    f"--{boundary}\r\n"
    'Content-Disposition: form-data; name="file"; filename="test.png"\r\n'
    "Content-Type: image/png\r\n\r\n"
).encode("utf-8") + file_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

upload_url = "http://127.0.0.1:9200/api/v1/products/upload-image"
req2 = urllib.request.Request(
    upload_url,
    data=body,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    }
)

try:
    with urllib.request.urlopen(req2) as response:
        print(f"Upload successful: {response.read().decode('utf-8')}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Upload failed: {e}")
