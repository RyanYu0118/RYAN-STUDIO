#!/usr/bin/env python3
"""将 rs-loader.js 注入 Halo：主题 globalHead + patch console.html（Injector 2.0 不支持 /console）。"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

SYSTEM_CM = "/registry/configmaps/system"
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


def patch_global_head(dry_run: bool) -> bool:
    obj = load_extension(SYSTEM_CM)
    ci = json.loads(obj["data"]["codeInjection"])
    head = ci.get("globalHead") or ""
    if "rs-loader.js" in head:
        print("globalHead 已包含 rs-loader.js")
        return False
    ci["globalHead"] = (head.rstrip() + "\n" + LOADER_TAG + "\n").strip()
    obj["data"]["codeInjection"] = json.dumps(ci, ensure_ascii=False)
    if dry_run:
        print("[dry-run] globalHead +=", LOADER_TAG)
        return True
    upsert_extension(SYSTEM_CM, obj)
    print("已写入 system.globalHead")
    return True


def main() -> int:
    p = argparse.ArgumentParser(description="Inject rs-loader for Halo theme globalHead")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    changed = patch_global_head(args.dry_run)
    if not changed and not args.dry_run:
        print("globalHead 无需修改")
    print("注意：后台 /console 须另运行 patch-halo-console-loader.py（Injector 2.0 跳过 /console/**）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
