# pixfix

Cleans up AI-generated pixel art — snap to grid, remove AA fuzz, reduce to a palette, remove backgrounds.

AI image generators produce "pixel art" riddled with mixels, anti-aliasing artifacts, and colors that don't snap to any grid. pixfix takes that messy output and produces clean, uniform pixel art while preserving the vibrancy and character of the original.

![pixfix welcome screen](screenshots/welcome.png)

![pixfix settings with live preview](screenshots/settings.png)

## Desktop App

**pixfix** is a native desktop app (macOS, Windows, Linux) with a full GUI for interactive pixel art cleanup. No terminal required.

- **Side-by-side preview** — see original and processed images instantly
- **Live settings** — tweak every pipeline parameter and see results update in real time
- **Diagnostics** — visualize grid detection scores and color histograms
- **3000+ palettes** — built-in palettes, Lospec integration, custom `.hex` files, or auto-extract
- **Sprite sheets** — auto-split AI-generated sheets (white background), normalize each tile, reassemble
- **GIF export** — animate sprite sheet rows or the entire sheet with configurable framerate
- **Batch processing** — drag in a folder of images and process them all at once
- **Keyboard-driven** — full keyboard navigation, or use the mouse

### Install

Download the latest release for your platform from the [Releases](https://github.com/your-username/normalize-pixelart/releases) page:

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` or NSIS installer |
| Linux | `.deb` or `.AppImage` |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `o` | Open image |
| `s` | Save processed image |
| `Space` | Reprocess with current settings |
| `r` | Reset settings to defaults |
| `Tab` | Switch tabs |
| `Esc` | Back to Preview |

---

## CLI

The `normalize-pixelart` CLI exposes the same pipeline for scripting, automation, and batch workflows.

### Install

```bash
# From source
git clone https://github.com/your-username/normalize-pixelart.git
cd normalize-pixelart
cargo build --release
# Binary: target/release/normalize-pixelart
```

Or grab a pre-built binary from [Releases](https://github.com/your-username/normalize-pixelart/releases).

Requires Rust 1.70+.

### Quick Start

```bash
# Auto-detect grid, normalize
normalize-pixelart process input.png output.png

# Force grid size, snap to PICO-8 palette
normalize-pixelart process input.png output.png --grid-size 4 --palette pico-8

# Remove background
normalize-pixelart process input.png output.png --grid-size 4 --remove-bg

# Batch process a folder
normalize-pixelart batch sprites/ output/ --grid-size 4 --palette sweetie-16

# Auto-split an AI sprite sheet
normalize-pixelart sheet ai_sheet.png --output-dir sprites/
```

---

## How It Works

A multi-stage pipeline runs on each image:

```
Input Image
    |
    v
 Grid Detection -----> find NxN pixel grid size and phase offset
    |
    v
 AA Removal ----------> remove anti-aliasing artifacts (optional)
    |
    v
 Grid Normalize ------> snap/downscale pixels to the detected grid
    |
    v
 Quantize ------------> snap colors to a palette (optional)
    |
    v
 Background Removal --> make solid backgrounds transparent (optional)
    |
    v
 Final Resize --------> scale to output dimensions if needed
    |
    v
Output Image
```

### Grid Detection

For each candidate grid size, measures **edge alignment**: the ratio of color gradients at grid boundaries vs. non-boundary positions. The correct grid size maximizes this ratio. Phase detection scans all offsets to find where the grid starts — this runs automatically even with `--grid-size` overrides.

### Snap Mode (Default)

For each NxN block, finds the dominant color via center-weighted majority voting and paints every pixel in the block with that single color. Eliminates mixels while preserving dithering across blocks. Output stays at the original resolution.

### Color Quantization

All color operations use **OKLAB color space** for perceptual accuracy — k-means clustering produces vibrant centroids, palette snapping picks the closest perceptual match, and AA detection accurately identifies interpolated pixels.

### Anti-Aliasing Removal

For each pixel, examines 8-connected neighbors. If the pixel lies "between" the two most dominant neighbor colors (triangle inequality in OKLAB), it's snapped to the closer one. Off by default for AI art.

---

## CLI Reference

### `process` — Normalize a single image

```
normalize-pixelart process [OPTIONS] <INPUT> [OUTPUT]
```

Output defaults to `<input>_normalized.png`.

#### Grid Options

| Flag | Description |
|------|-------------|
| `--grid-size <N>` | Override auto-detected grid size |
| `--grid-phase <X,Y>` | Override grid phase offset |
| `--no-grid-detect` | Skip grid detection (requires `--grid-size`) |
| `--max-grid-candidate <N>` | Max grid size to test (default: 32) |

#### Downscale Modes

| Mode | Description |
|------|-------------|
| `snap` | **Default.** Clean grid at original resolution. Best for AI art. |
| `center-weighted` | Reduce to logical resolution, center pixels weighted more. |
| `majority-vote` | Reduce to logical resolution, most common color wins. |
| `center-pixel` | Reduce to logical resolution, center pixel only. Fastest. |

#### Color Options

| Flag | Description |
|------|-------------|
| `--palette <NAME>` | Built-in palette (pico-8, sweetie-16, endesga-32, endesga-64, gameboy, nes) |
| `--palette-file <PATH>` | Custom `.hex` palette file |
| `--lospec <SLUG>` | Fetch palette from [Lospec](https://lospec.com) by slug |
| `--colors <N>` | Auto-extract N colors via k-means |
| `--no-quantize` | Skip quantization |

#### Background Options

| Flag | Description |
|------|-------------|
| `--remove-bg` | Enable background removal |
| `--bg-color <HEX>` | Explicit background color |
| `--bg-threshold <0-1>` | Border detection threshold (default: 0.4) |
| `--bg-tolerance <N>` | Color tolerance in OKLAB (default: 0.05) |
| `--no-flood-fill` | Global replacement instead of flood-fill |

#### Output Options

| Flag | Description |
|------|-------------|
| `--target-width <N>` | Output width |
| `--target-height <N>` | Output height |
| `--aa-threshold <0-1>` | Enable AA removal (off by default) |
| `--overwrite` | Overwrite existing output |

### `batch` — Process multiple images

```
normalize-pixelart batch [OPTIONS] <INPUT> <OUTPUT_DIR>
```

`INPUT` can be a directory or glob pattern. All `process` flags available.

```bash
normalize-pixelart batch "assets/**/*.png" output/ --grid-size 4 --palette pico-8
```

### `sheet` — Sprite sheet processing

```
normalize-pixelart sheet [OPTIONS] <INPUT> [OUTPUT]
```

**Fixed grid** (specify tile dimensions):
```bash
normalize-pixelart sheet tileset.png --tile-width 64 --tile-height 64 --grid-size 4
```

**Auto-split** (omit tile dimensions):
```bash
normalize-pixelart sheet ai_sheet.png --output-dir sprites/
```

| Flag | Description |
|------|-------------|
| `--tile-width <N>` / `--tile-height <N>` | Fixed tile size (omit for auto-split) |
| `--spacing <N>` | Gap between tiles (default: 0) |
| `--margin <N>` | Sheet border (default: 0) |
| `--separator-threshold <0-1>` | Auto-split separator detection (default: 0.90) |
| `--min-sprite-size <N>` | Filter small artifacts (default: 8) |
| `--pad <N>` | Output padding per sprite (default: 0) |
| `--output-dir <PATH>` | Save individual tiles |
| `--no-normalize` | Split/reassemble only |

### `tui` — Interactive terminal editor

```bash
normalize-pixelart tui [INPUT]
```

Terminal UI with live image preview (Sixel/halfblock). Requires the `tui` feature (default).

### `palette` — Palette utilities

```bash
normalize-pixelart palette list                    # Show built-in palettes
normalize-pixelart palette fetch endesga-32        # Download from Lospec
normalize-pixelart palette extract input.png -o p.hex  # Extract palette from image
```

---

## Config File

Save settings in `.normalize-pixelart.toml`:

```toml
[grid]
size = 4
max_candidate = 16

[aa]
threshold = 0.3

[quantize]
palette = "pico-8"

[background]
enabled = true
color = "FF00FF"
flood_fill = true

[output]
overwrite = false
```

CLI arguments override config values.

## Performance

Processing is parallelized via rayon — grid detection, AA removal, batch mode, and sprite sheet tiles all run in parallel. A 1024x1024 image typically processes in under 1 second.

## License

MIT
