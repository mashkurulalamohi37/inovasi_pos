import io
from fastapi.testclient import TestClient

def test_upload_product_image(auth_headers, client: TestClient):
    file_data = b"fake image content"
    files = {"file": ("test.png", io.BytesIO(file_data), "image/png")}
    res = client.post("/api/v1/products/upload-image", headers={k: v for k, v in auth_headers.items() if k != "Content-Type"}, files=files)
    assert res.status_code == 200
    assert "url" in res.json()
    assert res.json()["url"].startswith("/uploads/products/prod_")
