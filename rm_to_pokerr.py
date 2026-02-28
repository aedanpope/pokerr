"""
rm_to_pokerr.py

Convert a Range Manager export (.rm / .json) to the Pokerr JSON format.

Usage:
    python rm_to_pokerr.py <input.rm> [output.json] [--title "My Title"]

output.json defaults to data/<stem>.json
--title defaults to the input filename stem
"""

import argparse
import json
from pathlib import Path


def load_rm(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_node(cat_id: str, categories: dict) -> dict | None:
    cat = categories.get(cat_id)
    if not cat:
        return None

    if "children" in cat:
        children = [n for cid in cat["children"]
                    if (n := build_node(cid, categories)) is not None]
        return {"type": "folder", "name": cat["name"], "children": children}

    tabs = []
    for tab_id in cat.get("tabList", []):
        tab = cat.get("tabs", {}).get(tab_id)
        if not tab:
            continue
        ranges = [
            {"id": r["id"], "hands": r["hands"]}
            for r in tab.get("rangeList", [])
            if r.get("hands")
        ]
        tabs.append({"type": "tab", "name": tab["name"], "ranges": ranges})

    return {"type": "category", "name": cat["name"], "children": tabs}


def build_data(rm: dict, title: str) -> dict:
    categories = rm.get("categories", {})
    root = categories.get("root", {})
    tree = [n for cid in root.get("children", [])
            if (n := build_node(cid, categories)) is not None]

    range_meta = {
        rid: {"name": meta["name"]}
        for rid, meta in rm.get("ranges", {}).items()
        if meta.get("type") == "color"
    }

    return {
        "format": "pokerr",
        "version": 1,
        "title": title,
        "rangeMeta": range_meta,
        "tree": tree,
    }


def convert(input_path: str, output_path: str, title: str):
    rm = load_rm(input_path)
    data = build_data(rm, title)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Written: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert .rm to Pokerr JSON format")
    parser.add_argument("input", help="Input .rm or .json file")
    parser.add_argument("output", nargs="?", help="Output .json path (default: data/<stem>.json)")
    parser.add_argument("--title", help="Human-readable title for the range set")
    args = parser.parse_args()

    stem = Path(args.input).stem
    output = args.output or f"data/{stem}.json"
    title = args.title or stem

    convert(args.input, output, title)
