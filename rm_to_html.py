"""
rm_to_html.py

Convert a Range Manager export (.rm or .json) to a self-contained interactive HTML file.
The range data is embedded as a JS object; the page renders and navigates the tree dynamically.

Usage:
    python rm_to_html.py <input.rm|input.json> [output.html]
"""

import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# RM parsing — build a clean tree from the flat category map
# ---------------------------------------------------------------------------

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

    return {"title": title, "rangeMeta": range_meta, "tree": tree}


# ---------------------------------------------------------------------------
# HTML template — DATA_JSON is replaced before writing
# ---------------------------------------------------------------------------

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TITLE_PLACEHOLDER</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: system-ui, sans-serif;
    background: #f4f4f4;
    color: #1a1a1a;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ---- Header ---- */
  header {
    background: #1a3d2b;
    color: #e8f5ee;
    padding: .55rem 1.2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-shrink: 0;
  }
  #page-title { font-size: 1rem; font-weight: 600; letter-spacing: .03em; }

  .view-nav { display: flex; gap: .3rem; }
  .view-nav button {
    background: rgba(255,255,255,.15);
    border: 1px solid rgba(255,255,255,.3);
    color: #e8f5ee;
    padding: .25rem .8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: .85rem;
    font-family: inherit;
  }
  .view-nav button.active { background: rgba(255,255,255,.35); font-weight: 600; }
  .view-nav button:hover:not(.active) { background: rgba(255,255,255,.22); }

  /* ---- Views ---- */
  .view { display: none; flex: 1; overflow: hidden; }
  .view.active { display: flex; }

  /* ---- Tree view ---- */
  #tree-panel {
    width: 300px;
    min-width: 180px;
    background: #fff;
    border-right: 1px solid #ddd;
    overflow-y: auto;
    resize: horizontal;
    padding: .5rem 0;
    flex-shrink: 0;
  }
  .tree-node { cursor: pointer; user-select: none; }
  .tree-node-header {
    display: flex;
    align-items: center;
    gap: .4rem;
    padding: .28rem .6rem;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
  }
  .tree-node-header:hover { background: #eef6f1; }
  .tree-node-header.active { background: #d2ead9; font-weight: 600; }
  .chevron { font-size: .65rem; color: #888; width: .9rem; text-align: center; flex-shrink: 0; transition: transform .15s; }
  .chevron.open { transform: rotate(90deg); }
  .node-icon { font-size: .85rem; flex-shrink: 0; }
  .node-label { font-size: .88rem; overflow: hidden; text-overflow: ellipsis; }
  .tree-children { display: none; }
  .tree-children.open { display: block; }

  #content-panel { flex: 1; padding: 1.4rem 1.8rem; overflow-y: auto; }
  #content-panel h2 { font-size: 1.15rem; margin-bottom: .9rem; border-bottom: 1px solid #ccc; padding-bottom: .35rem; color: #1a3d2b; }
  .tab-block { margin-bottom: 1.3rem; }
  .tab-block h3 { font-size: .95rem; font-weight: 600; margin-bottom: .45rem; color: #333; }

  /* ---- Shared range components ---- */
  .legend { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.2rem; }
  .legend-item { display: flex; align-items: center; gap: .35rem; font-size: .8rem; }
  .legend-swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }

  .range-row { display: flex; align-items: baseline; gap: .5rem; margin-bottom: .3rem; flex-wrap: wrap; }
  .range-label {
    font-size: .78rem; font-weight: 700; white-space: nowrap; flex-shrink: 0;
    padding: .15rem .5rem; border-radius: 3px; color: #fff; min-width: 90px; text-align: center;
  }
  code.range-value {
    background: #f0f0f0; border-radius: 4px; padding: .2rem .5rem;
    font-size: .82rem; word-break: break-all; cursor: pointer; user-select: all;
    transition: background .12s; border: 1px solid transparent;
  }
  code.range-value:hover { background: #d0e8ff; border-color: #7ab; }
  code.range-value.copied { background: #c6f0c6; border-color: #5a5; }

  .placeholder { color: #999; font-style: italic; margin-top: 2rem; font-size: .92rem; }

  /* ---- Range grid ---- */
  .range-grid-wrap { margin-bottom: .9rem; }
  .range-grid {
    display: inline-grid;
    grid-template-columns: repeat(13, 30px);
    gap: 1px;
    background: #d8d8d8;
    border: 1px solid #d8d8d8;
    border-radius: 3px;
    overflow: hidden;
  }
  .grid-cell {
    background: #f0f0f0;
    display: flex; align-items: center; justify-content: center;
    height: 30px;
    font-size: .72rem;
    color: #111;
    cursor: default;
    position: relative;
  }
  .grid-cell.in-range { color: #111; font-weight: 600; }
  .grid-cell:hover {
    outline: 2px solid #333;
    z-index: 1;
    color: #000 !important;
    background: #fffde0 !important;
    font-weight: 700;
    font-size: .8rem;
  }
  .grid-mini-legend { display: flex; flex-wrap: wrap; gap: .25rem .5rem; margin-top: .35rem; }
  .grid-mini-legend-item { display: flex; align-items: center; gap: .25rem; font-size: .72rem; }
  .grid-mini-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

  .range-text-rows { margin-top: .1rem; }

  /* ---- Hand Builder view ---- */
  #builder-view { flex-direction: column; overflow-y: auto; padding: 1.2rem 1.8rem; gap: .6rem; }

  .builder-step {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .builder-step-header {
    background: #1a3d2b;
    color: #e8f5ee;
    padding: .4rem 1rem;
    font-size: .82rem;
    font-weight: 600;
    letter-spacing: .02em;
  }
  .builder-step-body { padding: .7rem 1rem; }

  .builder-chips { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .5rem; }
  .builder-chip {
    padding: .22rem .65rem;
    border-radius: 20px;
    border: 1px solid #ccc;
    cursor: pointer;
    font-size: .83rem;
    background: #f7f7f7;
    transition: all .1s;
    white-space: nowrap;
  }
  .builder-chip:hover { background: #eef6f1; border-color: #5a8; }
  .builder-chip.selected { background: #1a3d2b; color: #fff; border-color: #1a3d2b; }

  .builder-ranges { border-top: 1px solid #eee; margin-top: .55rem; padding-top: .55rem; }
  .builder-empty { font-style: italic; color: #aaa; font-size: .85rem; }

  .builder-arrow { text-align: center; color: #bbb; font-size: 1.2rem; line-height: 1; pointer-events: none; flex-shrink: 0; }
</style>
</head>
<body>

<header>
  <span id="page-title"></span>
  <nav class="view-nav">
    <button data-view="tree" class="active">Range Tree</button>
    <button data-view="builder">Hand Builder</button>
  </nav>
</header>

<div id="tree-view" class="view active">
  <div id="tree-panel"></div>
  <div id="content-panel">
    <p class="placeholder">Select a category or tab from the tree.</p>
  </div>
</div>

<div id="builder-view" class="view"></div>

<script>
const DATA = DATA_JSON_PLACEHOLDER;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function rangeColor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('raise') && n.includes('bluff')) return '#2471a3';
  if (n.includes('raise'))  return '#c0392b';
  if (n.includes('call'))   return '#1e8449';
  if (n.includes('fold'))   return '#7f8c8d';
  return '#555';
}

function getTopLevel(name) {
  return DATA.tree.find(n => n.name === name);
}

function copyCode(el) {
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    el.classList.add('copied');
    el.textContent = 'Copied!';
    setTimeout(() => { el.textContent = text; el.classList.remove('copied'); }, 1000);
  });
}

function makeLegend() {
  const div = document.createElement('div');
  div.className = 'legend';
  Object.values(DATA.rangeMeta).forEach(m => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const sw = document.createElement('div');
    sw.className = 'legend-swatch';
    sw.style.background = rangeColor(m.name);
    const nm = document.createElement('span');
    nm.textContent = m.name;
    item.appendChild(sw);
    item.appendChild(nm);
    div.appendChild(item);
  });
  return div;
}

function makeRangeRows(tab) {
  const frag = document.createDocumentFragment();
  (tab.ranges || []).forEach(r => {
    if (!r.hands.length) return;
    const meta = DATA.rangeMeta[r.id] || { name: r.id };
    const row = document.createElement('div');
    row.className = 'range-row';
    const lbl = document.createElement('span');
    lbl.className = 'range-label';
    lbl.textContent = meta.name;
    lbl.style.background = rangeColor(meta.name);
    const code = document.createElement('code');
    code.className = 'range-value';
    code.textContent = r.hands.join(',') + '::{}';
    code.title = 'Click to copy';
    code.addEventListener('click', () => copyCode(code));
    row.appendChild(lbl);
    row.appendChild(code);
    frag.appendChild(row);
  });
  return frag;
}

// ---------------------------------------------------------------------------
// Range grid (13×13 hand matrix)
// ---------------------------------------------------------------------------

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

function cellToHand(i, j) {
  if (i === j) return RANKS[i] + RANKS[i];          // pair
  if (i < j)   return RANKS[i] + RANKS[j] + 's';   // suited  (upper triangle)
  return             RANKS[j] + RANKS[i] + 'o';     // offsuit (lower triangle)
}

function buildHandMap(tab) {
  // Returns {hand_string → {color, name}}
  const map = {};
  (tab.ranges || []).forEach(r => {
    const meta = DATA.rangeMeta[r.id] || { name: r.id };
    r.hands.forEach(h => { map[h] = meta; });
  });
  return map;
}

function makeRangeGrid(tab) {
  const handMap = buildHandMap(tab);

  const wrap = document.createElement('div');
  wrap.className = 'range-grid-wrap';

  const grid = document.createElement('div');
  grid.className = 'range-grid';

  // Rows
  RANKS.forEach((_, i) => {
    RANKS.forEach((_, j) => {
      const hand = cellToHand(i, j);
      const meta = handMap[hand];
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (meta ? ' in-range' : '');
      cell.textContent = hand;
      cell.title = meta ? `${hand} — ${meta.name}` : hand;
      if (meta) cell.style.background = rangeColor(meta.name);
      grid.appendChild(cell);
    });
  });

  wrap.appendChild(grid);

  // Mini legend — only ranges that have hands in this tab
  const seen = new Map();
  (tab.ranges || []).forEach(r => {
    if (r.hands.length > 0 && !seen.has(r.id)) {
      seen.set(r.id, DATA.rangeMeta[r.id] || { name: r.id });
    }
  });
  if (seen.size > 0) {
    const legend = document.createElement('div');
    legend.className = 'grid-mini-legend';
    seen.forEach(meta => {
      const item = document.createElement('div');
      item.className = 'grid-mini-legend-item';
      const sw = document.createElement('div');
      sw.className = 'grid-mini-swatch';
      sw.style.background = rangeColor(meta.name);
      const nm = document.createElement('span');
      nm.textContent = meta.name;
      item.appendChild(sw);
      item.appendChild(nm);
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
  }

  return wrap;
}

// Combined display: grid + copy-pasteable text rows
function makeRangeDisplay(tab) {
  const div = document.createElement('div');
  div.appendChild(makeRangeGrid(tab));
  const textRows = document.createElement('div');
  textRows.className = 'range-text-rows';
  textRows.appendChild(makeRangeRows(tab));
  div.appendChild(textRows);
  return div;
}

// ---------------------------------------------------------------------------
// Tree view
// ---------------------------------------------------------------------------

function buildTree(nodes, depth) {
  const ul = document.createElement('div');
  ul.className = 'tree-children' + (depth === 0 ? ' open' : '');
  nodes.forEach(node => {
    const item = document.createElement('div');
    item.className = 'tree-node';
    const hdr = document.createElement('div');
    hdr.className = 'tree-node-header';
    hdr.style.paddingLeft = (0.6 + depth * 1.1) + 'rem';
    const chev = document.createElement('span');
    chev.className = 'chevron' + (depth === 0 ? ' open' : '');
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    const lbl = document.createElement('span');
    lbl.className = 'node-label';
    lbl.textContent = node.name;

    if (node.type === 'tab') {
      chev.textContent = '';
      icon.textContent = '📋';
      hdr.addEventListener('click', () => {
        document.querySelectorAll('.tree-node-header').forEach(h => h.classList.remove('active'));
        hdr.classList.add('active');
        renderTreeTab(node);
      });
    } else {
      chev.textContent = '▶';
      icon.textContent = node.type === 'folder' ? '📁' : '📂';
      const kids = buildTree(node.children, depth + 1);
      item.appendChild(kids);
      hdr.addEventListener('click', () => {
        const open = kids.classList.toggle('open');
        chev.classList.toggle('open', open);
        if (node.type === 'category') {
          document.querySelectorAll('.tree-node-header').forEach(h => h.classList.remove('active'));
          hdr.classList.add('active');
          renderTreeCategory(node);
        }
      });
      if (depth === 0) { kids.classList.add('open'); chev.classList.add('open'); }
    }
    hdr.appendChild(chev); hdr.appendChild(icon); hdr.appendChild(lbl);
    item.insertBefore(hdr, item.firstChild);
    ul.appendChild(item);
  });
  return ul;
}

function renderTreeTab(tab) {
  const panel = document.getElementById('content-panel');
  panel.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = tab.name;
  panel.appendChild(h2);
  panel.appendChild(makeRangeDisplay(tab));
}

function renderTreeCategory(cat) {
  const panel = document.getElementById('content-panel');
  panel.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = cat.name;
  panel.appendChild(h2);
  panel.appendChild(makeLegend());
  cat.children.forEach(tab => {
    const block = document.createElement('div');
    block.className = 'tab-block';
    const h3 = document.createElement('h3');
    h3.textContent = tab.name;
    block.appendChild(h3);
    block.appendChild(makeRangeDisplay(tab));
    panel.appendChild(block);
  });
}

// ---------------------------------------------------------------------------
// Hand Builder — data queries
// ---------------------------------------------------------------------------

// Step 2: given a raiser position name, find all "Facing RFI" tabs that match.
// Returns [{tab, label, facingPos}]
function getStep2Options(rfiName) {
  const facingNode = getTopLevel('Facing RFI');
  if (!facingNode) return [];
  const kw = rfiName.toLowerCase();
  const results = [];
  (facingNode.children || []).forEach(subcat => {
    (subcat.children || []).forEach(tab => {
      if (tab.type !== 'tab') return;
      let label, facingPos;
      if (subcat.name === 'EP/MP') {
        // Tab format: "[facer] vs [raiser]" — match only when rfiName is the RAISER (right of "vs")
        const parts = tab.name.toLowerCase().split(/\s+vs\s+/);
        if (parts.length < 2 || !parts[1].includes(kw)) return;
        label = tab.name;
        // Extract facing position from the left side, e.g. "HJ" or last token of "+1/2"
        const facerPart = tab.name.split(/\s+vs\s+/i)[0].trim();
        facingPos = facerPart.split(/[\s/]+/).pop();
      } else {
        // subcat name IS the facing position; tab is simply "vs LJ"
        if (!tab.name.toLowerCase().includes(kw)) return;
        label = `${subcat.name} ${tab.name}`;
        facingPos = subcat.name;
      }
      results.push({ tab, label, facingPos });
    });
  });
  return results;
}

// Step 3: given raiser + facing positions, find "RFI vs 3bet" response tabs.
// Returns [{tab, label}]
function getStep3Options(rfiName, facingPos) {
  const vs3betNode = getTopLevel('RFI vs 3bet');
  if (!vs3betNode) return [];
  const rn = rfiName.toLowerCase();
  const fp = facingPos.toLowerCase();
  // Match raiser's sub-category (handles "BTN/SB" grouping)
  const raiserCat = (vs3betNode.children || []).find(c => {
    const cn = c.name.toLowerCase();
    return cn === rn || cn.includes(rn) || rn.includes(cn);
  });
  if (!raiserCat) return [];
  return (raiserCat.children || [])
    .filter(t => t.type === 'tab' && t.name.toLowerCase().includes(fp))
    .map(t => ({ tab: t, label: t.name }));
}

// ---------------------------------------------------------------------------
// Hand Builder — rendering
// ---------------------------------------------------------------------------

const builder = { rfiTab: null, facingTab: null, facingPos: null, vs3betTab: null };

function makeBuilderStep(title, options, selectedTab, onSelect) {
  const card = document.createElement('div');
  card.className = 'builder-step';

  const hdr = document.createElement('div');
  hdr.className = 'builder-step-header';
  hdr.textContent = title;
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'builder-step-body';

  if (options.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'builder-empty';
    msg.textContent = 'No matching ranges found.';
    body.appendChild(msg);
  } else {
    const chips = document.createElement('div');
    chips.className = 'builder-chips';
    options.forEach(opt => {
      const chip = document.createElement('div');
      chip.className = 'builder-chip' + (selectedTab === opt.tab ? ' selected' : '');
      chip.textContent = opt.label;
      chip.addEventListener('click', () => onSelect(opt));
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    if (selectedTab) {
      const rd = document.createElement('div');
      rd.className = 'builder-ranges';
      rd.appendChild(makeRangeDisplay(selectedTab));
      body.appendChild(rd);
    }
  }

  card.appendChild(body);
  return card;
}

function renderBuilder() {
  const view = document.getElementById('builder-view');
  view.innerHTML = '';

  const rfiNode = getTopLevel('RFI');
  if (!rfiNode) {
    view.innerHTML = '<p class="placeholder">No RFI category found in data.</p>';
    return;
  }

  const arrow = () => {
    const d = document.createElement('div');
    d.className = 'builder-arrow';
    d.textContent = '↓';
    return d;
  };

  // Step 1 — open-raise position
  view.appendChild(makeBuilderStep(
    '1  Open-raise position',
    rfiNode.children.map(t => ({ tab: t, label: t.name })),
    builder.rfiTab,
    opt => {
      builder.rfiTab = opt.tab;
      builder.facingTab = null; builder.facingPos = null; builder.vs3betTab = null;
      renderBuilder();
    }
  ));

  if (!builder.rfiTab) return;

  // Step 2 — facing position
  view.appendChild(arrow());
  view.appendChild(makeBuilderStep(
    `2  Facing position  (vs ${builder.rfiTab.name} open)`,
    getStep2Options(builder.rfiTab.name),
    builder.facingTab,
    opt => {
      builder.facingTab = opt.tab; builder.facingPos = opt.facingPos; builder.vs3betTab = null;
      renderBuilder();
    }
  ));

  if (!builder.facingTab) return;

  // Step 3 — raiser's response to the 3-bet (only if data exists)
  const step3 = getStep3Options(builder.rfiTab.name, builder.facingPos);
  if (step3.length > 0) {
    view.appendChild(arrow());
    view.appendChild(makeBuilderStep(
      `3  ${builder.rfiTab.name} vs ${builder.facingPos} 3-bet`,
      step3,
      builder.vs3betTab,
      opt => { builder.vs3betTab = opt.tab; renderBuilder(); }
    ));
  }
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.view-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(name + '-view').classList.add('active');
  document.querySelector(`.view-nav button[data-view="${name}"]`).classList.add('active');
  if (name === 'builder') renderBuilder();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.getElementById('page-title').textContent = DATA.title;
document.getElementById('tree-panel').appendChild(buildTree(DATA.tree, 0));
document.querySelectorAll('.view-nav button').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
</script>
</body>
</html>
"""


def generate_html(data: dict) -> str:
    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return (HTML_TEMPLATE
            .replace("TITLE_PLACEHOLDER", data["title"])
            .replace("DATA_JSON_PLACEHOLDER", data_json))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def convert(input_path: str, output_path: str = None):
    rm = load_rm(input_path)
    title = Path(input_path).stem
    if output_path is None:
        output_path = str(Path(input_path).with_suffix(".html"))

    data = build_data(rm, title)
    html = generate_html(data)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Written: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rm_to_html.py <input.rm|input.json> [output.html]")
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
