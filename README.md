# Poker Range Converter

Converts poker range data exported from [Range Manager](https://range-manager.com/) into an interactive HTML viewer with [Open Poker Tools](https://openpokertools.com/)-compatible range strings.

## Usage

```bash
python rm_to_html.py <input.rm|input.json> [output.html]
```

The output path defaults to the input filename with `.html` extension.

**Examples:**

```bash
python rm_to_html.py myRangeManagerProject.rm
# → myRangeManagerProject.html

python rm_to_html.py myRangeManagerProject.rm ranges.html
# → ranges.html
```

Open the resulting `.html` file in any browser — no server required.

## Dependencies

```bash
pip install markdown
```

## HTML viewer

The output is a single self-contained HTML file. The full range data is embedded as a JS object and rendered dynamically.

- **Left panel** — collapsible tree mirroring the Range Manager hierarchy (folders → categories → tabs)
- **Right panel** — clicking a category shows all its tabs with every named range; clicking a tab shows just that one
- **Click any range string** to copy it to clipboard (ready to paste into Open Poker Tools or similar)

## Range Manager hierarchy

```
Project (.rm / .json)
└── Folder          (e.g. "Facing RFI")
    └── Category    (e.g. "BTN")
        └── Tab     (e.g. "vs CO")
            └── Range lists per action (Raise Value, Call, Raise Bluff, Fold)
```

Both `.rm` and `.json` exports from Range Manager use identical JSON formatting — either works as input.

## Open Poker Tools format

Each range is rendered as a comma-separated hand string in standard notation:

```
AA,KK,QQ,JJ,TT,99,AKs,AQs,AKo
```

Hand notation:
- `AKs` — suited
- `AKo` — offsuit
- `AK` — both suited and offsuit (where applicable)
- `QQ` — pocket pair

## Files

| File | Description |
|------|-------------|
| `rm_to_html.py` | Main conversion script |
| `myRangeManagerProject.rm` | Example Range Manager project |
| `my_range.json` | Same project exported as JSON |
