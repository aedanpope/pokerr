"""
rm_to_opt_md.py

Convert a Range Manager export (.rm or .json) to:
  - a Markdown file (.md)
  - a self-contained HTML file (.html)

Each range within a tab is shown as an OPT-compatible comma-separated hand string.

Usage:
    python rm_to_opt_md.py <input.rm|input.json> [output_stem]
    (output_stem defaults to the input filename stem)
"""

import json
import sys
from pathlib import Path

import markdown


def load_rm(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def opt_string(hands: list) -> str:
    """Format a list of hands as an OPT-compatible comma-separated string."""
    return ",".join(hands)


def render_tab(tab: dict, ranges: dict, heading_level: int) -> list:
    lines = []
    name = tab.get("name", "Unnamed")
    lines.append(f"{'#' * heading_level} {name}")
    lines.append("")

    range_list = tab.get("rangeList", [])
    for range_entry in range_list:
        range_id = range_entry.get("id", "")
        range_meta = ranges.get(range_id, {})
        range_name = range_meta.get("name", range_id)
        hands = range_entry.get("hands", [])
        if hands:
            lines.append(f"**{range_name}**: `{opt_string(hands)}`")
        else:
            lines.append(f"**{range_name}**: *(empty)*")

    lines.append("")
    return lines


def render_leaf_category(cat: dict, ranges: dict, tab_heading_level: int) -> list:
    lines = []
    tab_list = cat.get("tabList", [])
    tabs = cat.get("tabs", {})
    for tab_id in tab_list:
        tab = tabs.get(tab_id)
        if tab:
            lines.extend(render_tab(tab, ranges, tab_heading_level))
    return lines


def render_category(cat_id: str, categories: dict, ranges: dict, heading_level: int) -> list:
    cat = categories.get(cat_id)
    if not cat:
        return []

    name = cat.get("name", cat_id)
    lines = [f"{'#' * heading_level} {name}", ""]

    if "children" in cat:
        # Folder: recurse into child categories
        for child_id in cat.get("children", []):
            lines.extend(render_category(child_id, categories, ranges, heading_level + 1))
    else:
        # Leaf: render tabs one level deeper than the category heading
        lines.extend(render_leaf_category(cat, ranges, heading_level + 1))

    return lines


HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  body {{
    font-family: system-ui, sans-serif;
    max-width: 960px;
    margin: 2rem auto;
    padding: 0 1.5rem;
    color: #1a1a1a;
    line-height: 1.6;
  }}
  h1 {{ border-bottom: 2px solid #333; padding-bottom: .3em; }}
  h2 {{ border-bottom: 1px solid #aaa; padding-bottom: .2em; margin-top: 2rem; }}
  h3 {{ margin-top: 1.5rem; color: #444; }}
  h4 {{ margin-top: 1rem; color: #666; }}
  code {{
    background: #f0f0f0;
    border-radius: 3px;
    padding: .1em .4em;
    font-size: .9em;
    word-break: break-all;
    cursor: pointer;
    user-select: all;
    transition: background .15s;
  }}
  code:hover {{
    background: #d0e8ff;
    outline: 1px solid #7ab;
  }}
  code.copied {{
    background: #c6f0c6;
    outline: 1px solid #5a5;
  }}
  ul {{ padding-left: 1.4em; }}
  li {{ margin: .2em 0; }}
  p {{ margin: .4em 0; }}
</style>
</head>
<body>
{body}
<script>
  document.querySelectorAll('code').forEach(el => {{
    el.title = 'Click to copy';
    el.addEventListener('click', () => {{
      navigator.clipboard.writeText(el.textContent).then(() => {{
        el.classList.add('copied');
        const prev = el.textContent;
        el.textContent = 'Copied!';
        setTimeout(() => {{
          el.textContent = prev;
          el.classList.remove('copied');
        }}, 1000);
      }});
    }});
  }});
</script>
</body>
</html>
"""


def md_to_html(md_text: str, title: str) -> str:
    body = markdown.markdown(md_text, extensions=["fenced_code"])
    return HTML_TEMPLATE.format(title=title, body=body)


def convert(input_path: str, output_stem: str = None):
    data = load_rm(input_path)
    categories = data.get("categories", {})
    ranges = data.get("ranges", {})
    root = categories.get("root", {})

    stem = Path(input_path).stem
    base = Path(output_stem) if output_stem else Path(input_path).with_suffix("")

    md_path = base.with_suffix(".md")
    html_path = base.with_suffix(".html")

    lines = [f"# {stem}", ""]

    # Emit a legend of range types defined in the project
    if ranges:
        lines.append("## Range Legend")
        lines.append("")
        for range_id, meta in ranges.items():
            if meta.get("type") == "color":
                color = meta.get("color", "")
                rname = meta.get("name", range_id)
                lines.append(f"- **{rname}** — `{color}`")
        lines.append("")

    for cat_id in root.get("children", []):
        lines.extend(render_category(cat_id, categories, ranges, 2))

    md_text = "\n".join(lines)

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    print(f"  Markdown : {md_path}")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(md_to_html(md_text, stem))
    print(f"  HTML     : {html_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rm_to_opt_md.py <input.rm|input.json> [output_stem]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_stem = sys.argv[2] if len(sys.argv) > 2 else None
    print(f"Converting '{input_file}'...")
    convert(input_file, output_stem)
