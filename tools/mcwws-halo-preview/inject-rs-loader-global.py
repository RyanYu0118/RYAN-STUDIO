#!/usr/bin/env python3
"""将 rs-loader.js 写入 Halo 系统 globalHead（后台 /console 也会加载）。"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

CM = "/registry/configmaps/system"
LOADER_TAG = '<script src="/upload/wiki-data/rs-loader.js?v=110"></script>'
MYSQL = [
    "docker",
    "exec",
    "-i",
    "halo-mysql",
    "mysql",
    "-uroot",
    "-phalo_root_local_change_me",
    "halo_h6jyni",
]


def mysql_exec(sql: str) -> None:
    proc = subprocess.run(MYSQL, input=sql.encode("utf-8"), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or proc.stdout.decode())


def load_extension(name: str) -> dict:
    cmd = MYSQL + ["-N", "-B", "-e", f"SELECT data FROM extensions WHERE name='{name}'"]
    raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8").strip()
    for attempt in (raw, raw.replace("\\\\", "\\")):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    raise ValueError(f"Cannot parse JSON for {name}")


def upsert_extension(name: str, obj: dict) -> None:
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\\", "\\\\").replace("'", "\\'")
    sql = (
        f"INSERT INTO extensions (name, data, version) VALUES ('{name}', '{payload}', 1) "
        f"ON DUPLICATE KEY UPDATE data=VALUES(data), version=version+1;"
    )
    mysql_exec(sql)


def main() -> int:
    p = argparse.ArgumentParser(description="Inject rs-loader into Halo system globalHead")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    obj = load_extension(CM)
    ci = json.loads(obj["data"]["codeInjection"])
    head = ci.get("globalHead") or ""
    if "rs-loader.js" in head:
        print("globalHead 已包含 rs-loader.js，无需修改")
        return 0
    ci["globalHead"] = (head.rstrip() + "\n" + LOADER_TAG + "\n").strip()
    obj["data"]["codeInjection"] = json.dumps(ci, ensure_ascii=False)
    if args.dry_run:
        print("would set globalHead tail to:", LOADER_TAG)
        return 0
    upsert_extension(CM, obj)
    print("已写入 system.globalHead:", LOADER_TAG)
    print("请重启 Halo 或等待 ~30s 后硬刷新 /console/posts/editor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
