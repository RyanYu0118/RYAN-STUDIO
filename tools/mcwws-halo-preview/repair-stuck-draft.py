"""Clear inProgress on stuck redlink drafts (local dev)."""
import json
import subprocess
import sys

POST_ID = sys.argv[1] if len(sys.argv) > 1 else "8f5d5c37-34bf-496a-b2ff-2ebbd95dd44c"
POST = f"/registry/content.halo.run/posts/{POST_ID}"


def load(name: str) -> dict:
    cmd = [
        "docker", "exec", "halo-mysql", "mysql",
        "-uroot", "-phalo_root_local_change_me", "halo_h6jyni", "-N", "-B",
        "-e", f"SELECT data FROM extensions WHERE name='{name}';",
    ]
    raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()
    return json.loads(raw.replace("\\\\", "\\"))


def save(name: str, obj: dict) -> None:
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\\", "\\\\").replace("'", "\\'")
    sql = (
        f"INSERT INTO extensions (name, data, version) VALUES ('{name}', '{payload}', 1) "
        f"ON DUPLICATE KEY UPDATE data=VALUES(data), version=version+1;"
    )
    subprocess.run(
        ["docker", "exec", "-i", "halo-mysql", "mysql",
         "-uroot", "-phalo_root_local_change_me", "halo_h6jyni"],
        input=sql.encode("utf-8"),
        check=True,
    )


post = load(POST)
post.setdefault("status", {})["inProgress"] = False
spec = post.setdefault("spec", {})
head = spec.get("headSnapshot") or spec.get("baseSnapshot")
if head and not spec.get("releaseSnapshot"):
    spec["releaseSnapshot"] = head
save(POST, post)
print("fixed", POST_ID, "inProgress=False release=", spec.get("releaseSnapshot"))
