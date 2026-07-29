#!/usr/bin/env python3
"""为缺少 halo-manual-id 的文章在正文头部插入 HTML 模块块（与 Wiki 发布一致）。"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

_TOOL_DIR = Path(__file__).resolve().parent
_export_spec = importlib.util.spec_from_file_location(
    "mcwws_export_post_json", _TOOL_DIR / "export-post-json.py"
)
if _export_spec is None or _export_spec.loader is None:
    raise RuntimeError("Cannot load export-post-json.py")
_export = importlib.util.module_from_spec(_export_spec)
_export_spec.loader.exec_module(_export)

html_edited = _export.html_edited

CONTENT_JSON_KEY = "content.halo.run/content-json"


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def api_request(
    base: str,
    pat: str,
    method: str,
    path: str,
    body: dict | None = None,
) -> tuple[int, dict | str]:
    url = base.rstrip("/") + path
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return resp.status, {}
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {"message": e.reason}
        except json.JSONDecodeError:
            payload = raw or {"message": str(e)}
        return e.code, payload


def list_posts(base: str, pat: str) -> list[dict]:
    items: list[dict] = []
    page = 1
    while page <= 50:
        qs = urllib.parse.urlencode({"page": page, "size": 100})
        code, data = api_request(
            base,
            pat,
            "GET",
            f"/apis/uc.api.content.halo.run/v1alpha1/posts?{qs}",
        )
        if code != 200 or not isinstance(data, dict):
            break
        batch = data.get("items") or []
        if not batch:
            break
        items.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return items


def get_post(base: str, pat: str, name: str) -> dict | None:
    code, data = api_request(
        base,
        pat,
        "GET",
        f"/apis/uc.api.content.halo.run/v1alpha1/posts/{urllib.parse.quote(name, safe='')}",
    )
    if code != 200 or not isinstance(data, dict):
        return None
    return data


def has_manual_id(*texts: str) -> bool:
    for t in texts:
        if t and "halo-manual-id" in t:
            return True
    return False


def manual_id_block(post_name: str) -> str:
    inner = f'<div id="halo-manual-id" style="display:none;">{post_name}</div>'
    return html_edited(inner)


def prepend_manual(raw: str, content: str, raw_type: str, block: str) -> tuple[str, str]:
    raw = raw or ""
    content = content or raw
    sep = "\n\n" if raw_type == "markdown" and raw and not raw.startswith("<") else ""
    new_raw = block + sep + raw.lstrip()
    new_content = block + sep + content.lstrip()
    return new_raw, new_content


def parse_content_json(post: dict) -> tuple[str, str, str] | None:
    ann = (post.get("metadata") or {}).get("annotations") or {}
    raw_json = ann.get(CONTENT_JSON_KEY)
    if not raw_json:
        return None
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return None
    raw_type = data.get("rawType") or "html"
    raw = data.get("raw") or ""
    content = data.get("content") or raw
    return raw_type, raw, content


def is_published(post: dict) -> bool:
    labels = (post.get("metadata") or {}).get("labels") or {}
    if labels.get("content.halo.run/published") == "true":
        return True
    spec = post.get("spec") or {}
    status = post.get("status") or {}
    return spec.get("publish") is True and status.get("phase") == "PUBLISHED"


def update_post_content(
    base: str,
    pat: str,
    post: dict,
    raw_type: str,
    raw: str,
    content: str,
    *,
    republish: bool,
) -> tuple[int, str]:
    name = post["metadata"]["name"]
    post = json.loads(json.dumps(post))
    ann = post.setdefault("metadata", {}).setdefault("annotations", {})
    ann["content.halo.run/preferred-editor"] = (
        "markdown" if raw_type == "markdown" else "default"
    )
    ann[CONTENT_JSON_KEY] = json.dumps(
        {"raw": raw, "content": content, "rawType": raw_type},
        ensure_ascii=False,
    )

    code, resp = api_request(
        base,
        pat,
        "PUT",
        f"/apis/uc.api.content.halo.run/v1alpha1/posts/{name}",
        post,
    )
    if code not in (200, 201):
        return code, str(resp)

    draft = {"raw": raw, "content": content, "rawType": raw_type}
    code, resp = api_request(
        base,
        pat,
        "PUT",
        f"/apis/uc.api.content.halo.run/v1alpha1/posts/{name}/draft",
        draft,
    )
    if code not in (200, 201, 204):
        return code, str(resp)

    if republish and is_published(post):
        code, resp = api_request(
            base,
            pat,
            "PUT",
            f"/apis/uc.api.content.halo.run/v1alpha1/posts/{name}/publish",
            {},
        )
        if code not in (200, 201, 204):
            return code, str(resp)

    return 200, "ok"


def main() -> int:
    p = argparse.ArgumentParser(description="Prepend halo-manual-id HTML block to posts missing it")
    p.add_argument("--base-url", default="", help="默认 HALO_BASE_URL 或 http://localhost:8090")
    p.add_argument("--pat", default="", help="默认 HALO_PAT")
    p.add_argument(
        "--wiki-root",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "wiki",
    )
    p.add_argument("--dry-run", action="store_true", help="只列出将修改的文章")
    p.add_argument("--no-republish", action="store_true", help="已发布文章更新草稿后不再次 publish")
    p.add_argument("--slug", default="", help="仅处理指定 spec.slug")
    args = p.parse_args()

    wiki_root = args.wiki_root.resolve()
    load_env_file(wiki_root / ".halo.env")

    base = (args.base_url or os.environ.get("HALO_BASE_URL", "http://localhost:8090")).strip()
    pat = (args.pat or os.environ.get("HALO_PAT", "")).strip()
    if not pat:
        print("需要 HALO_PAT（wiki/.halo.env）", file=sys.stderr)
        return 2

    posts = list_posts(base, pat)
    if args.slug:
        posts = [p for p in posts if (p.get("spec") or {}).get("slug") == args.slug]

    fixed = 0
    skipped = 0
    failed = 0

    for stub in posts:
        name = (stub.get("metadata") or {}).get("name")
        slug = (stub.get("spec") or {}).get("slug") or ""
        if not name:
            continue
        full = get_post(base, pat, name)
        if not full:
            failed += 1
            print(f"FAIL get {slug} ({name})", file=sys.stderr)
            continue
        parsed = parse_content_json(full)
        if not parsed:
            skipped += 1
            continue
        raw_type, raw, content = parsed
        if has_manual_id(raw, content):
            skipped += 1
            continue
        block = manual_id_block(name)
        new_raw, new_content = prepend_manual(raw, content, raw_type, block)
        title = (full.get("spec") or {}).get("title") or slug
        if args.dry_run:
            print(f"would fix: {slug}  {title}")
            fixed += 1
            continue
        code, msg = update_post_content(
            base,
            pat,
            full,
            raw_type,
            new_raw,
            new_content,
            republish=not args.no_republish,
        )
        if code == 200:
            fixed += 1
            print(f"OK: {slug}")
        else:
            failed += 1
            print(f"FAIL {slug} HTTP {code}: {msg}", file=sys.stderr)

    print(f"done fixed={fixed} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
