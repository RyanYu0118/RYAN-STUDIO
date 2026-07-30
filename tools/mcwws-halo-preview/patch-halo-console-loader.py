#!/usr/bin/env python3
"""向 Halo application.jar 的 ui/console.html 注入 rs-loader（后台唯一可靠入口）。"""
from __future__ import annotations

import argparse
import io
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

LOADER_TAG = '<script src="/upload/wiki-data/rs-loader.js?v=111"></script>'
CONSOLE_HTML = "ui/console.html"
HALO_CONTAINER = "halo"
JAR_IN_CONTAINER = "/application/application.jar"


def docker_cp(src: str, dst: Path) -> None:
    subprocess.run(["docker", "cp", f"{HALO_CONTAINER}:{src}", str(dst)], check=True)


def docker_cp_to(src: Path, dst: str) -> None:
    subprocess.run(["docker", "cp", str(src), f"{HALO_CONTAINER}:{dst}"], check=True)


def patch_console_html(html: str) -> tuple[str, bool]:
    if LOADER_TAG in html:
        return html, False
    if "rs-loader.js" in html:
        import re
        html = re.sub(
            r'<script\s+src="/upload/wiki-data/rs-loader\.js\?v=\d+"></script>\s*',
            "",
            html,
        )
    marker = "</head>"
    idx = html.lower().find(marker)
    if idx < 0:
        raise ValueError("console.html 中未找到 </head>")
    patched = html[:idx] + f"    {LOADER_TAG}\n  " + html[idx:]
    return patched, True


def patch_jar(jar_path: Path) -> bool:
    with zipfile.ZipFile(jar_path, "r") as zin:
        try:
            original = zin.read(CONSOLE_HTML).decode("utf-8")
        except KeyError as e:
            raise FileNotFoundError(f"{CONSOLE_HTML} not in jar") from e
        patched, changed = patch_console_html(original)
        if not changed:
            return False
        # rebuild jar with replaced console.html
        tmp = jar_path.with_suffix(".patched.jar")
        with zipfile.ZipFile(tmp, "w") as zout:
            for item in zin.infolist():
                data = patched.encode("utf-8") if item.filename == CONSOLE_HTML else zin.read(item.filename)
                info = zipfile.ZipInfo(item.filename)
                info.compress_type = item.compress_type
                info.external_attr = item.external_attr
                info.date_time = item.date_time
                zout.writestr(info, data)
    tmp.replace(jar_path)
    return True


def main() -> int:
    p = argparse.ArgumentParser(description="Patch Halo console.html to load rs-loader.js")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-restart", action="store_true")
    p.add_argument("--jar", type=Path, help="Local jar path instead of docker cp")
    args = p.parse_args()

    with tempfile.TemporaryDirectory() as td:
        jar_path = Path(args.jar) if args.jar else Path(td) / "application.jar"
        if not args.jar:
            print(f"从容器 {HALO_CONTAINER} 复制 {JAR_IN_CONTAINER} ...")
            docker_cp(JAR_IN_CONTAINER, jar_path)

        with zipfile.ZipFile(jar_path, "r") as z:
            html = z.read(CONSOLE_HTML).decode("utf-8")
        new_html, would_change = patch_console_html(html)
        if not would_change:
            print("console.html 已包含 rs-loader.js，无需修改")
            return 0
        if args.dry_run:
            print("[dry-run] 将在 </head> 前注入:", LOADER_TAG)
            return 0

        print("写入 patch 到 jar ...")
        patch_jar(jar_path)

        if not args.jar:
            print(f"复制回容器 {JAR_IN_CONTAINER} ...")
            docker_cp_to(jar_path, JAR_IN_CONTAINER)

    if not args.no_restart:
        print("重启 Halo ...")
        subprocess.run(["docker", "restart", HALO_CONTAINER], check=True)
    print("完成。硬刷新 /console/posts/editor，控制台应出现 RS Loader 日志。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
