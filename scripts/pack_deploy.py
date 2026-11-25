import fnmatch
import os
import tarfile
import time

EXCLUDE_DIRS = {
    "node_modules", "venv", "__pycache__", ".pytest_cache", ".git",
    "dist", ".output", ".tanstack", "backups", "certs", "logs",
    "test-results", "playwright-report", "uploads", "store documents",
    "scratch", "_ref-saas-portable", ".claude", ".kilo", ".qodo",
}

EXCLUDE_PATTERNS = [
    "*.tar.gz", "*.tgz", "*.zip", "*.db", "*.db.*", "*.sqlite*",
    "*.log", "*.wav", "*.mp4", "*.ogg", "*.pdf", "*.docx",
    ".env", ".env.*",
]

def should_exclude(rel_path: str, is_dir: bool) -> bool:
    norm = rel_path.replace("\\", "/")
    while norm.startswith("./"):
        norm = norm[2:]
    parts = [p for p in norm.split("/") if p]
    # Exclude any folder matching EXCLUDE_DIRS
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    if not is_dir and parts:
        filename = parts[-1]
        for pattern in EXCLUDE_PATTERNS:
            if fnmatch.fnmatch(filename, pattern):
                return True
    return False

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    archive_name = "pulse-pos-deploy.tar.gz"
    archive_path = os.path.join(root, archive_name)

    if os.path.exists(archive_path):
        try:
            os.remove(archive_path)
            print(f"Removed previous {archive_name}")
        except Exception as e:
            print(f"Warning: could not remove previous {archive_name}: {e}")

    print(f"Packing project from: {root}")
    t0 = time.time()
    count = 0

    with tarfile.open(archive_path, "w:gz") as tar:
        for dirpath, dirnames, filenames in os.walk(root):
            # Prune excluded directories in-place so os.walk does not descend into them
            dirnames[:] = [
                d for d in dirnames
                if not should_exclude(os.path.relpath(os.path.join(dirpath, d), root), True)
            ]

            for f in filenames:
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, root)
                if should_exclude(rel_path, False):
                    continue
                try:
                    tar.add(full_path, arcname=rel_path.replace("\\", "/"))
                    count += 1
                except (PermissionError, OSError) as pe:
                    print(f"Skipping unreadable file {rel_path}: {pe}")

    elapsed = time.time() - t0
    size_mb = os.path.getsize(archive_path) / (1024 * 1024)
    print(f"\n[SUCCESS] Archive ready: {archive_path}")
    print(f"Packed {count} files. Size: {size_mb:.2f} MB (created in {elapsed:.1f}s)")

if __name__ == "__main__":
    main()
