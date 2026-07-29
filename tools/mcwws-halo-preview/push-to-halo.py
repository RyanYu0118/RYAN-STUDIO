#!/usr/bin/env python3
"""把 wiki/*.md 编译为 Halo HTML 并通过 API 创建/更新文章（需个人令牌 PAT）。"""
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

build_halo_html = _export.build_halo_html
build_post = _export.build_post
compile_for_halo_publish = _export.compile_for_halo_publish
expand_halo_includes = _export.expand_halo_includes
find_wiki_root = _export.find_wiki_root
parse_frontmatter_meta = _export.parse_frontmatter_meta
rewrite_halo_asset_paths = _export.rewrite_halo_asset_paths
split_frontmatter = _export.split_frontmatter


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


def find_post_by_slug(posts: list[dict], slug: str) -> dict | None:
    for p in posts:
        spec = p.get("spec") or {}
        if spec.get("slug") == slug:
            return p
    return None


def load_name_map(wiki_root: Path) -> dict[str, str]:
    f = wiki_root / ".halo-post-names.json"
    if not f.is_file():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_name_map(wiki_root: Path, mapping: dict[str, str]) -> None:
    f = wiki_root / ".halo-post-names.json"
    f.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")


def attach_content_json(post: dict, html: str) -> dict:
    post = json.loads(json.dumps(post))
    ann = post.setdefault("metadata", {}).setdefault("annotations", {})
    ann["content.halo.run/preferred-editor"] = "default"
    ann["content.halo.run/content-json"] = json.dumps(
        {"content": html, "raw": html, "rawType": "html"},
        ensure_ascii=False,
    )
    return post


def attach_content(post: dict, raw_type: str, raw: str, content: str) -> dict:
    post = json.loads(json.dumps(post))
    ann = post.setdefault("metadata", {}).setdefault("annotations", {})
    editor = "markdown" if raw_type == "markdown" else "default"
    ann["content.halo.run/preferred-editor"] = editor
    ann["content.halo.run/content-json"] = json.dumps(
        {"content": content, "raw": raw, "rawType": raw_type},
        ensure_ascii=False,
    )
    return post


def compile_md(src: Path, *, rewrite_upload: bool) -> tuple[dict[str, str], str, str, str, str]:
    raw = src.read_text(encoding="utf-8")
    wiki_root = find_wiki_root(src)
    fm, body = split_frontmatter(raw)
    meta = parse_frontmatter_meta(fm)
    body = expand_halo_includes(body, wiki_root)
    if rewrite_upload:
        body = rewrite_halo_asset_paths(body)
    slug = meta.get("slug") or src.stem
    post_name = load_name_map(wiki_root).get(slug, "")
    if not post_name:
        import uuid

        post_name = str(uuid.uuid4())
    raw_type, raw, content = compile_for_halo_publish(body, post_name)
    return meta, slug, raw_type, raw, content


def build_payload(
    meta: dict[str, str], post_name: str, raw_type: str, raw: str, content: str, *, publish: bool
) -> dict:
    post = build_post(meta, post_name, draft=not publish)
    post = attach_content(post, raw_type, raw, content)
    if publish:
        post["spec"]["publish"] = True
        post.setdefault("metadata", {}).setdefault("labels", {})[
            "content.halo.run/published"
        ] = "true"
        post.setdefault("status", {})["phase"] = "PUBLISHED"
    return post


def push_post(
    base: str,
    pat: str,
    post_body: dict,
    *,
    publish: bool,
) -> tuple[int, dict | str]:
    name = post_body["metadata"]["name"]
    slug = post_body["spec"]["slug"]

    posts = list_posts(base, pat)
    existing = find_post_by_slug(posts, slug)
    if existing:
        name = existing["metadata"]["name"]
        post_body["metadata"]["name"] = name

    if existing:
        code, resp = api_request(
            base,
            pat,
            "PUT",
            f"/apis/uc.api.content.halo.run/v1alpha1/posts/{name}",
            post_body,
        )
        if code not in (200, 201):
            return code, resp
    else:
        code, resp = api_request(
            base,
            pat,
            "POST",
            "/apis/uc.api.content.halo.run/v1alpha1/posts",
            post_body,
        )
        if code not in (200, 201):
            return code, resp
        if isinstance(resp, dict) and resp.get("metadata", {}).get("name"):
            name = resp["metadata"]["name"]

    # 同步草稿正文（部分版本 PUT post 已含 content-json，再写 draft 更稳）
    content_json = json.loads(
        post_body["metadata"]["annotations"]["content.halo.run/content-json"]
    )
    draft = {
        "raw": content_json["raw"],
        "content": content_json["content"],
        "rawType": content_json["rawType"],
    }
    code, resp = api_request(
        base,
        pat,
        "PUT",
        f"/apis/uc.api.content.halo.run/v1alpha1/posts/{name}/draft",
        draft,
    )
    if code not in (200, 201, 204):
        return code, resp

    if publish:
        code, resp = api_request(
            base,
            pat,
            "PUT",
            f"/apis/uc.api.content.halo.run/v1alpha1/posts/{name}/publish",
            {},
        )
        if code not in (200, 201, 204):
            return code, resp

    return 200, {"name": name, "slug": slug, "permalink": f"/archives/{slug}"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Push wiki markdown to Halo via API")
    p.add_argument("input", type=Path, help="wiki 源 .md")
    p.add_argument("--base-url", default="", help="Halo 根 URL，默认读 HALO_BASE_URL")
    p.add_argument("--pat", default="", help="个人令牌 pat_…，默认读 HALO_PAT")
    p.add_argument("--rewrite-upload", action="store_true")
    p.add_argument("--publish", action="store_true", help="推送后立即发布")
    p.add_argument("--dry-run", action="store_true", help="只编译，不请求 API")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    src: Path = args.input.resolve()
    if not src.is_file():
        print(f"Missing: {src}", file=sys.stderr)
        return 1

    wiki_root = find_wiki_root(src)
    load_env_file(wiki_root / ".halo.env")

    meta, slug, raw_type, raw, content = compile_md(src, rewrite_upload=args.rewrite_upload)
    name_map = load_name_map(wiki_root)
    post_name = name_map.get(slug, "")
    if not post_name:
        import uuid

        post_name = str(uuid.uuid4())

    post_body = build_payload(meta, post_name, raw_type, raw, content, publish=args.publish)

    if args.dry_run:
        out = wiki_root / "_publish" / f"{src.stem}.dry-run.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8")
        print(f"Dry-run ({raw_type}): {out}")
        print(f"slug={slug} title={meta.get('title', '')}")
        return 0

    base = (args.base_url or os.environ.get("HALO_BASE_URL", "http://localhost:8090")).strip()
    pat = (args.pat or os.environ.get("HALO_PAT", "")).strip()
    if not pat:
        print(
            "未配置 Halo 个人令牌。请在 wiki/.halo.env 中设置 HALO_PAT=pat_xxx\n"
            "控制台 → 个人中心 → 个人令牌（需文章读写权限）\n"
            "或先用: wiki/导出Halo文章JSON.ps1 生成 JSON 在后台导入。",
            file=sys.stderr,
        )
        return 2

    code, resp = push_post(base, pat, post_body, publish=args.publish)
    if code != 200:
        print(f"Halo API 失败 HTTP {code}:", resp, file=sys.stderr)
        return 1

    name_map[slug] = resp["name"]
    save_name_map(wiki_root, name_map)
    url = base.rstrip("/") + resp["permalink"]
    print(f"OK: {meta.get('title', slug)}")
    print(f"  前台: {url}")
    print(f"  编辑: {base.rstrip('/')}/console/posts/editor?name={resp['name']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
