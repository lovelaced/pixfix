// pixfix/ui/src/app.ts
var { invoke } = window.__TAURI__.core;
var { open: openDialog, save: saveDialog } = window.__TAURI__.dialog;
var state = {
  activeTab: "preview",
  imageLoaded: false,
  imagePath: null,
  imageInfo: null,
  settingsFocusIndex: 0,
  processing: false,
  palettes: [],
  paletteIndex: 0,
  config: {
    gridSize: null,
    gridPhaseX: null,
    gridPhaseY: null,
    maxGridCandidate: 32,
    noGridDetect: false,
    downscaleMode: "snap",
    aaThreshold: null,
    paletteName: null,
    autoColors: null,
    lospecSlug: null,
    customPalette: null,
    noQuantize: false,
    removeBg: false,
    bgColor: null,
    borderThreshold: null,
    bgTolerance: 0.05,
    floodFill: true,
    outputScale: null,
    outputWidth: null,
    outputHeight: null
  },
  lospecResult: null,
  lospecError: null,
  lospecLoading: false,
  paletteColors: null,
  showAllHelp: false,
  lastProcessTime: null,
  batchFiles: [],
  batchOutputDir: null,
  batchRunning: false,
  batchProgress: null,
  batchResult: null,
  sheetMode: "auto",
  sheetConfig: {
    tileWidth: null,
    tileHeight: null,
    spacing: 0,
    margin: 0,
    separatorThreshold: 0.9,
    minSpriteSize: 8,
    pad: 0,
    noNormalize: false
  },
  sheetPreview: null,
  sheetProcessing: false,
  gifMode: "row",
  gifRow: 0,
  gifFps: 10,
  gifPreviewUrl: null,
  gifGenerating: false
};
var DEFAULT_CONFIG = JSON.parse(JSON.stringify(state.config));
var DOWNSCALE_MODES = ["snap", "center-weighted", "majority-vote", "center-pixel"];
function getSettings() {
  const c = state.config;
  return [
    { section: "Grid Detection" },
    {
      key: "gridSize",
      label: "Grid Size",
      value: c.gridSize === null ? "auto" : String(c.gridSize),
      help: 'How many screen pixels make up one "logical" pixel in your art. Auto-detection works well for most images. Override if the grid looks wrong.',
      changed: c.gridSize !== null
    },
    {
      key: "gridPhaseX",
      label: "Phase X",
      value: c.gridPhaseX === null ? "auto" : String(c.gridPhaseX),
      help: "Override the X offset of the grid alignment. Usually auto-detected.",
      changed: c.gridPhaseX !== null
    },
    {
      key: "gridPhaseY",
      label: "Phase Y",
      value: c.gridPhaseY === null ? "auto" : String(c.gridPhaseY),
      help: "Override the Y offset of the grid alignment. Usually auto-detected.",
      changed: c.gridPhaseY !== null
    },
    {
      key: "noGridDetect",
      label: "Skip Grid",
      value: c.noGridDetect ? "on" : "off",
      help: "Skip grid detection entirely. Useful if your image is already at logical resolution.",
      changed: c.noGridDetect
    },
    {
      key: "maxGridCandidate",
      label: "Max Grid",
      value: String(c.maxGridCandidate),
      help: "Maximum grid size to test during auto-detection (default: 32).",
      changed: c.maxGridCandidate !== 32
    },
    {
      key: "downscaleMode",
      label: "Mode",
      value: c.downscaleMode,
      help: 'How to combine pixels in each grid cell. "snap" cleans in-place at original resolution. Others reduce to logical pixel resolution.',
      changed: c.downscaleMode !== "snap"
    },
    { section: "Anti-Aliasing" },
    {
      key: "aaThreshold",
      label: "AA Removal",
      value: c.aaThreshold === null ? "off" : c.aaThreshold.toFixed(2),
      help: "Removes soft blending between colors added by AI generators. Lower values are more aggressive. Try 0.30\u20130.50 for most images.",
      changed: c.aaThreshold !== null
    },
    { section: "Color Palette" },
    {
      key: "paletteName",
      label: "Palette",
      value: c.paletteName === null ? "none" : c.paletteName,
      help: "Snap all colors to a classic pixel art palette. Mutually exclusive with Lospec and Auto Colors.",
      changed: c.paletteName !== null
    },
    {
      key: "lospecSlug",
      label: "Lospec",
      value: c.lospecSlug === null ? "none" : c.lospecSlug,
      help: 'Load any palette from lospec.com by slug (e.g. "pico-8", "endesga-32"). Press Enter to type a slug and fetch it.',
      changed: c.lospecSlug !== null
    },
    {
      key: "autoColors",
      label: "Auto Colors",
      value: c.autoColors === null ? "off" : String(c.autoColors),
      help: "Auto-extract the best N colors from your image using k-means clustering in OKLAB color space.",
      changed: c.autoColors !== null
    },
    {
      key: "paletteFile",
      label: "Load .hex",
      value: c.customPalette && !c.lospecSlug ? `${c.customPalette.length} colors` : "none",
      help: "Load a palette from a .hex file (one hex color per line). Overrides palette and auto colors.",
      changed: c.customPalette !== null && c.lospecSlug === null
    },
    {
      key: "noQuantize",
      label: "Skip Quantize",
      value: c.noQuantize ? "on" : "off",
      help: "Skip color quantization entirely. Useful if you only want grid snapping and AA removal without palette changes.",
      changed: c.noQuantize
    },
    { section: "Background" },
    {
      key: "removeBg",
      label: "Remove BG",
      value: c.removeBg ? "on" : "off",
      help: "Detect and make the background transparent. The dominant border color is treated as background.",
      changed: c.removeBg
    },
    {
      key: "bgColor",
      label: "BG Color",
      value: c.bgColor === null ? "auto" : c.bgColor,
      help: 'Explicit background color as hex (e.g. "#FF00FF"). If auto, detects from border pixels.',
      changed: c.bgColor !== null
    },
    {
      key: "borderThreshold",
      label: "Border Thresh",
      value: c.borderThreshold === null ? "0.40" : c.borderThreshold.toFixed(2),
      help: "Fraction of border pixels that must match for auto-detection (0.0\u20131.0, default: 0.40).",
      changed: c.borderThreshold !== null
    },
    {
      key: "bgTolerance",
      label: "BG Tolerance",
      value: c.bgTolerance.toFixed(2),
      help: "How different a pixel can be from the background color and still count as background. Higher = more aggressive.",
      changed: c.bgTolerance !== 0.05
    },
    {
      key: "floodFill",
      label: "Flood Fill",
      value: c.floodFill ? "on" : "off",
      help: "On: only remove connected background from edges. Off: remove matching color everywhere.",
      changed: !c.floodFill
    },
    { section: "Output" },
    {
      key: "outputScale",
      label: "Scale",
      value: c.outputScale === null ? "off" : c.outputScale + "x",
      help: "Scale the output by an integer multiplier (2x, 3x, etc). Great for upscaling sprites for game engines.",
      changed: c.outputScale !== null
    },
    {
      key: "outputWidth",
      label: "Width",
      value: c.outputWidth === null ? "auto" : String(c.outputWidth),
      help: "Explicit output width in pixels. Overrides scale.",
      changed: c.outputWidth !== null
    },
    {
      key: "outputHeight",
      label: "Height",
      value: c.outputHeight === null ? "auto" : String(c.outputHeight),
      help: "Explicit output height in pixels. Overrides scale.",
      changed: c.outputHeight !== null
    }
  ];
}
function getSettingRows() {
  return getSettings().filter((s) => !s.section);
}
function adjustSetting(key, direction) {
  const c = state.config;
  switch (key) {
    case "gridSize":
      if (c.gridSize === null) {
        c.gridSize = state.imageInfo?.gridSize || 4;
      } else {
        c.gridSize = Math.max(1, c.gridSize + direction);
        if (c.gridSize === 1 && direction < 0)
          c.gridSize = null;
      }
      break;
    case "gridPhaseX":
      if (c.gridPhaseX === null) {
        c.gridPhaseX = 0;
      } else {
        c.gridPhaseX = Math.max(0, c.gridPhaseX + direction);
      }
      break;
    case "gridPhaseY":
      if (c.gridPhaseY === null) {
        c.gridPhaseY = 0;
      } else {
        c.gridPhaseY = Math.max(0, c.gridPhaseY + direction);
      }
      break;
    case "maxGridCandidate":
      c.maxGridCandidate = Math.max(2, Math.min(64, c.maxGridCandidate + direction * 4));
      break;
    case "noGridDetect":
      c.noGridDetect = !c.noGridDetect;
      break;
    case "downscaleMode": {
      let idx = DOWNSCALE_MODES.indexOf(c.downscaleMode);
      idx = (idx + direction + DOWNSCALE_MODES.length) % DOWNSCALE_MODES.length;
      c.downscaleMode = DOWNSCALE_MODES[idx];
      break;
    }
    case "aaThreshold":
      if (c.aaThreshold === null) {
        c.aaThreshold = 0.5;
      } else {
        c.aaThreshold = Math.round((c.aaThreshold + direction * 0.05) * 100) / 100;
        if (c.aaThreshold <= 0)
          c.aaThreshold = null;
        else if (c.aaThreshold > 1)
          c.aaThreshold = 1;
      }
      break;
    case "paletteName": {
      const names = [null, ...state.palettes.map((p) => p.slug)];
      let idx = names.indexOf(c.paletteName);
      idx = (idx + direction + names.length) % names.length;
      c.paletteName = names[idx];
      if (c.paletteName !== null) {
        c.autoColors = null;
        c.lospecSlug = null;
        c.customPalette = null;
        state.lospecResult = null;
        fetchPaletteColors(c.paletteName);
      } else {
        state.paletteColors = null;
      }
      break;
    }
    case "autoColors":
      if (c.autoColors === null) {
        c.autoColors = 16;
      } else {
        c.autoColors = Math.max(2, c.autoColors + direction * 2);
        if (c.autoColors <= 2 && direction < 0)
          c.autoColors = null;
        else if (c.autoColors > 256)
          c.autoColors = 256;
      }
      if (c.autoColors !== null) {
        c.paletteName = null;
        c.lospecSlug = null;
        c.customPalette = null;
        state.paletteColors = null;
        state.lospecResult = null;
      }
      break;
    case "removeBg":
      c.removeBg = !c.removeBg;
      break;
    case "borderThreshold":
      if (c.borderThreshold === null) {
        c.borderThreshold = 0.4;
      } else {
        c.borderThreshold = Math.round((c.borderThreshold + direction * 0.05) * 100) / 100;
        if (c.borderThreshold <= 0)
          c.borderThreshold = null;
        else if (c.borderThreshold > 1)
          c.borderThreshold = 1;
      }
      break;
    case "bgTolerance":
      c.bgTolerance = Math.round((c.bgTolerance + direction * 0.01) * 100) / 100;
      c.bgTolerance = Math.max(0.01, Math.min(0.5, c.bgTolerance));
      break;
    case "floodFill":
      c.floodFill = !c.floodFill;
      break;
    case "outputScale":
      if (c.outputScale === null) {
        c.outputScale = 2;
      } else {
        c.outputScale = c.outputScale + direction;
        if (c.outputScale < 2)
          c.outputScale = null;
        else if (c.outputScale > 16)
          c.outputScale = 16;
      }
      break;
    case "outputWidth":
      if (c.outputWidth === null) {
        c.outputWidth = state.imageInfo?.width || 64;
      } else {
        c.outputWidth = Math.max(1, c.outputWidth + direction * 8);
      }
      break;
    case "outputHeight":
      if (c.outputHeight === null) {
        c.outputHeight = state.imageInfo?.height || 64;
      } else {
        c.outputHeight = Math.max(1, c.outputHeight + direction * 8);
      }
      break;
  }
}
async function fetchPaletteColors(slug) {
  try {
    const colors = await invoke("get_palette_colors", { slug });
    state.paletteColors = colors;
    renderSettings();
  } catch {
    state.paletteColors = null;
  }
}
async function fetchLospec(slug) {
  state.lospecLoading = true;
  state.lospecError = null;
  renderSettings();
  try {
    const result = await invoke("fetch_lospec", { slug });
    state.lospecResult = result;
    state.config.lospecSlug = slug;
    state.config.customPalette = result.colors;
    state.config.paletteName = null;
    state.config.autoColors = null;
    state.paletteColors = result.colors;
    state.lospecLoading = false;
    renderSettings();
    autoProcess();
  } catch (e) {
    state.lospecError = String(e);
    state.lospecLoading = false;
    renderSettings();
  }
}
async function loadPaletteFileDialog() {
  try {
    const result = await openDialog({
      multiple: false,
      filters: [{
        name: "Palette Files",
        extensions: ["hex", "txt"]
      }]
    });
    if (result) {
      const colors = await invoke("load_palette_file", { path: result });
      state.config.customPalette = colors;
      state.config.paletteName = null;
      state.config.autoColors = null;
      state.config.lospecSlug = null;
      state.lospecResult = null;
      state.paletteColors = colors;
      renderSettings();
      autoProcess();
    }
  } catch (e) {
    setStatus("Error loading palette: " + e, "error");
  }
}
function setStatus(msg, type = "") {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = "status-msg" + (type ? " " + type : "");
  const spinner = document.getElementById("status-spinner");
  if (type === "processing") {
    spinner.classList.add("active");
  } else {
    spinner.classList.remove("active");
  }
}
function showWelcomeLoading() {
  document.getElementById("welcome-loading").style.display = "flex";
}
function hideWelcomeLoading() {
  document.getElementById("welcome-loading").style.display = "none";
}
function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === "panel-" + name);
  });
  if (name === "batch")
    renderBatch();
  if (name === "sheet")
    renderSheet();
}
var SELECT_SETTINGS = ["downscaleMode", "paletteName"];
var BOOLEAN_SETTINGS = ["removeBg", "floodFill", "noGridDetect", "noQuantize"];
var INPUT_SETTINGS = ["gridSize", "gridPhaseX", "gridPhaseY", "maxGridCandidate", "aaThreshold", "autoColors", "bgColor", "borderThreshold", "bgTolerance", "lospecSlug", "outputScale", "outputWidth", "outputHeight"];
var FILE_SETTINGS = ["paletteFile"];
var NULLABLE_SETTINGS = {
  gridSize: { offLabel: "auto", defaultValue: () => state.imageInfo?.gridSize || 4 },
  gridPhaseX: { offLabel: "auto", defaultValue: () => 0 },
  gridPhaseY: { offLabel: "auto", defaultValue: () => 0 },
  aaThreshold: { offLabel: "off", defaultValue: () => 0.5 },
  autoColors: { offLabel: "off", defaultValue: () => 16 },
  lospecSlug: { offLabel: "none", defaultValue: () => null },
  bgColor: { offLabel: "auto", defaultValue: () => null },
  borderThreshold: { offLabel: "0.40", defaultValue: () => 0.4 },
  outputScale: { offLabel: "off", defaultValue: () => 2 },
  outputWidth: { offLabel: "auto", defaultValue: () => state.imageInfo?.width || 64 },
  outputHeight: { offLabel: "auto", defaultValue: () => state.imageInfo?.height || 64 }
};
function renderSettings() {
  const list = document.getElementById("settings-list");
  const focused = document.activeElement;
  if (focused && focused.classList?.contains("setting-inline-input") && list.contains(focused)) {
    updateSettingsFocusOnly(list);
    return;
  }
  const settings = getSettings();
  let rowIndex = 0;
  let html = "";
  for (const s of settings) {
    if (s.section) {
      html += `<div class="setting-section">${s.section}</div>`;
    } else {
      const isFocused = rowIndex === state.settingsFocusIndex ? " focused" : "";
      const changed = s.changed ? " changed" : "";
      html += `<div class="setting-row${isFocused}" data-index="${rowIndex}" data-key="${s.key}">`;
      html += `<span class="setting-indicator">&#9654;</span>`;
      html += `<span class="setting-label">${s.label}</span>`;
      html += `<span class="setting-value${changed}">`;
      if (SELECT_SETTINGS.includes(s.key)) {
        html += renderInlineSelect(s.key);
      } else if (BOOLEAN_SETTINGS.includes(s.key)) {
        html += `<span class="setting-toggle" data-key="${s.key}">${escapeHtml(s.value)}</span>`;
      } else if (FILE_SETTINGS.includes(s.key)) {
        if (s.changed) {
          html += escapeHtml(s.value);
          html += `<span class="setting-clear" data-key="${s.key}" title="Clear">\xD7</span>`;
        } else {
          html += `<span class="setting-toggle" data-key="${s.key}">${escapeHtml(s.value)}</span>`;
        }
      } else if (INPUT_SETTINGS.includes(s.key)) {
        html += renderInlineInput(s.key);
        if (s.key in NULLABLE_SETTINGS && s.changed) {
          const nullable = NULLABLE_SETTINGS[s.key];
          html += `<span class="setting-clear" data-key="${s.key}" title="Reset to ${nullable.offLabel}">\xD7</span>`;
        }
      } else {
        html += escapeHtml(s.value);
      }
      html += `</span>`;
      html += `</div>`;
      html += `<div class="setting-help">${s.help}</div>`;
      if ((s.key === "paletteName" || s.key === "lospecSlug" || s.key === "paletteFile") && state.paletteColors && state.paletteColors.length > 0) {
        if (s.key === "paletteName" && state.config.paletteName !== null || s.key === "lospecSlug" && state.config.lospecSlug !== null || s.key === "paletteFile" && state.config.customPalette !== null && state.config.lospecSlug === null) {
          html += renderPaletteSwatches(state.paletteColors);
        }
      }
      if (s.key === "lospecSlug") {
        if (state.lospecLoading) {
          html += `<div class="lospec-info lospec-loading">Fetching palette...</div>`;
        } else if (state.lospecError) {
          html += `<div class="lospec-error">${escapeHtml(state.lospecError)}</div>`;
        } else if (state.lospecResult && state.config.lospecSlug) {
          html += `<div class="lospec-info">${escapeHtml(state.lospecResult.name)} \u2014 ${state.lospecResult.numColors} colors</div>`;
        }
      }
      rowIndex++;
    }
  }
  list.innerHTML = html;
}
function updateSettingsFocusOnly(list) {
  const rows = list.querySelectorAll(".setting-row");
  rows.forEach((row, i) => {
    row.classList.toggle("focused", i === state.settingsFocusIndex);
  });
}
function renderPaletteSwatches(colors) {
  let html = '<div class="palette-swatches">';
  for (const color of colors) {
    html += `<div class="palette-swatch" style="background:${color}" title="${color}"></div>`;
  }
  html += "</div>";
  return html;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderInlineSelect(key) {
  const c = state.config;
  switch (key) {
    case "downscaleMode": {
      const opts = DOWNSCALE_MODES.map((m) => `<option value="${m}"${m === c.downscaleMode ? " selected" : ""}>${m}</option>`).join("");
      return `<select class="setting-inline-select" data-key="${key}">${opts}</select>`;
    }
    case "paletteName": {
      let opts = `<option value=""${c.paletteName === null ? " selected" : ""}>none</option>`;
      opts += state.palettes.map((p) => `<option value="${p.slug}"${p.slug === c.paletteName ? " selected" : ""}>${p.slug} (${p.numColors})</option>`).join("");
      return `<select class="setting-inline-select" data-key="${key}">${opts}</select>`;
    }
    default:
      return "";
  }
}
function renderInlineInput(key) {
  const c = state.config;
  switch (key) {
    case "gridSize": {
      const val = c.gridSize === null ? "" : c.gridSize;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="auto" data-key="${key}">`;
    }
    case "gridPhaseX": {
      const val = c.gridPhaseX === null ? "" : c.gridPhaseX;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="auto" data-key="${key}">`;
    }
    case "gridPhaseY": {
      const val = c.gridPhaseY === null ? "" : c.gridPhaseY;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="auto" data-key="${key}">`;
    }
    case "maxGridCandidate": {
      return `<input class="setting-inline-input" type="text" value="${c.maxGridCandidate}" data-key="${key}">`;
    }
    case "aaThreshold": {
      const val = c.aaThreshold === null ? "" : c.aaThreshold.toFixed(2);
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="off" data-key="${key}">`;
    }
    case "autoColors": {
      const val = c.autoColors === null ? "" : c.autoColors;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="off" data-key="${key}">`;
    }
    case "bgColor": {
      const val = c.bgColor ?? "";
      return `<input class="setting-inline-input" type="text" value="${escapeHtml(val)}" placeholder="auto (#RRGGBB)" data-key="${key}">`;
    }
    case "borderThreshold": {
      const val = c.borderThreshold === null ? "" : c.borderThreshold.toFixed(2);
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="0.40" data-key="${key}">`;
    }
    case "bgTolerance": {
      const val = c.bgTolerance.toFixed(2);
      return `<input class="setting-inline-input" type="text" value="${val}" data-key="${key}">`;
    }
    case "outputScale": {
      const val = c.outputScale === null ? "" : c.outputScale;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="off" data-key="${key}">`;
    }
    case "outputWidth": {
      const val = c.outputWidth === null ? "" : c.outputWidth;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="auto" data-key="${key}">`;
    }
    case "outputHeight": {
      const val = c.outputHeight === null ? "" : c.outputHeight;
      return `<input class="setting-inline-input" type="text" value="${val}" placeholder="auto" data-key="${key}">`;
    }
    case "lospecSlug": {
      const val = c.lospecSlug ?? "";
      return `<input class="setting-inline-input setting-inline-input-wide" type="text" value="${escapeHtml(val)}" placeholder="e.g. pico-8" data-key="${key}">`;
    }
    default:
      return "";
  }
}
function startEditing(key) {
  if (BOOLEAN_SETTINGS.includes(key)) {
    adjustSetting(key, 1);
    renderSettings();
    autoProcess();
    return;
  }
  if (SELECT_SETTINGS.includes(key)) {
    return;
  }
  if (FILE_SETTINGS.includes(key)) {
    if (key === "paletteFile") {
      loadPaletteFileDialog();
    }
    return;
  }
  if (INPUT_SETTINGS.includes(key)) {
    const input = document.querySelector(`.setting-inline-input[data-key="${key}"]`);
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }
}
function clearSetting(key) {
  const c = state.config;
  switch (key) {
    case "gridSize":
      c.gridSize = null;
      break;
    case "gridPhaseX":
      c.gridPhaseX = null;
      break;
    case "gridPhaseY":
      c.gridPhaseY = null;
      break;
    case "aaThreshold":
      c.aaThreshold = null;
      break;
    case "autoColors":
      c.autoColors = null;
      break;
    case "lospecSlug":
      c.lospecSlug = null;
      c.customPalette = null;
      state.lospecResult = null;
      state.paletteColors = null;
      break;
    case "paletteFile":
      if (!c.lospecSlug) {
        c.customPalette = null;
        state.paletteColors = null;
      }
      break;
    case "bgColor":
      c.bgColor = null;
      break;
    case "borderThreshold":
      c.borderThreshold = null;
      break;
    case "outputScale":
      c.outputScale = null;
      break;
    case "outputWidth":
      c.outputWidth = null;
      break;
    case "outputHeight":
      c.outputHeight = null;
      break;
  }
  renderSettings();
  autoProcess();
}
function commitEdit(key, rawValue) {
  const c = state.config;
  const val = rawValue.trim();
  switch (key) {
    case "gridSize":
      if (val === "" || val === "auto") {
        c.gridSize = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 1)
          c.gridSize = n;
      }
      break;
    case "gridPhaseX":
      if (val === "" || val === "auto") {
        c.gridPhaseX = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0)
          c.gridPhaseX = n;
      }
      break;
    case "gridPhaseY":
      if (val === "" || val === "auto") {
        c.gridPhaseY = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0)
          c.gridPhaseY = n;
      }
      break;
    case "maxGridCandidate": {
      const n = parseInt(val);
      if (!isNaN(n) && n >= 2)
        c.maxGridCandidate = Math.min(64, n);
      break;
    }
    case "aaThreshold":
      if (val === "" || val === "off") {
        c.aaThreshold = null;
      } else {
        const n = parseFloat(val);
        if (!isNaN(n))
          c.aaThreshold = Math.max(0.01, Math.min(1, n));
      }
      break;
    case "autoColors":
      if (val === "" || val === "off") {
        c.autoColors = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 2) {
          c.autoColors = Math.min(256, n);
          c.paletteName = null;
          c.lospecSlug = null;
          c.customPalette = null;
          state.paletteColors = null;
          state.lospecResult = null;
        }
      }
      break;
    case "bgColor":
      if (val === "" || val === "auto") {
        c.bgColor = null;
      } else {
        const hex = val.startsWith("#") ? val : "#" + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          c.bgColor = hex.toUpperCase();
        }
      }
      break;
    case "borderThreshold":
      if (val === "" || val === "auto") {
        c.borderThreshold = null;
      } else {
        const n = parseFloat(val);
        if (!isNaN(n))
          c.borderThreshold = Math.max(0.01, Math.min(1, n));
      }
      break;
    case "bgTolerance": {
      const n = parseFloat(val);
      if (!isNaN(n))
        c.bgTolerance = Math.max(0.01, Math.min(0.5, n));
      break;
    }
    case "downscaleMode":
      if (DOWNSCALE_MODES.includes(val))
        c.downscaleMode = val;
      break;
    case "paletteName":
      c.paletteName = val === "" ? null : val;
      if (c.paletteName !== null) {
        c.autoColors = null;
        c.lospecSlug = null;
        c.customPalette = null;
        state.lospecResult = null;
        fetchPaletteColors(c.paletteName);
      } else {
        state.paletteColors = null;
      }
      break;
    case "lospecSlug":
      if (val === "" || val === "none") {
        c.lospecSlug = null;
        c.customPalette = null;
        state.lospecResult = null;
        state.paletteColors = null;
        renderSettings();
        autoProcess();
        return;
      }
      fetchLospec(val);
      return;
    case "outputScale":
      if (val === "" || val === "off" || val === "1") {
        c.outputScale = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 2 && n <= 16)
          c.outputScale = n;
      }
      break;
    case "outputWidth":
      if (val === "" || val === "auto") {
        c.outputWidth = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 1)
          c.outputWidth = n;
      }
      break;
    case "outputHeight":
      if (val === "" || val === "auto") {
        c.outputHeight = null;
      } else {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 1)
          c.outputHeight = n;
      }
      break;
  }
  renderSettings();
  autoProcess();
}
function renderDiagnostics() {
  const info = state.imageInfo;
  if (!info) {
    document.getElementById("diag-grid-info").innerHTML = '<div class="diag-item"><span class="label">No image loaded</span></div>';
    document.getElementById("diag-grid-bars").innerHTML = "";
    document.getElementById("diag-info").innerHTML = "";
    document.getElementById("diag-histogram").innerHTML = "";
    return;
  }
  let gridHtml = "";
  gridHtml += `<div class="diag-item"><span class="label">Detected size</span><span class="value">${info.gridSize ?? "none"}</span></div>`;
  gridHtml += `<div class="diag-item"><span class="label">Confidence</span><span class="value">${info.gridConfidence != null ? (info.gridConfidence * 100).toFixed(1) + "%" : "n/a"}</span></div>`;
  document.getElementById("diag-grid-info").innerHTML = gridHtml;
  let barsHtml = "";
  if (info.gridScores && info.gridScores.length > 0) {
    const maxScore = Math.max(...info.gridScores.map((s) => s[1]));
    const bestSize = info.gridSize;
    for (const [size, score] of info.gridScores) {
      const pct = maxScore > 0 ? score / maxScore * 100 : 0;
      const best = size === bestSize ? " best" : "";
      barsHtml += `<div class="grid-bar-row">`;
      barsHtml += `<span class="grid-bar-label">${size}</span>`;
      barsHtml += `<div class="grid-bar-track"><div class="grid-bar-fill${best}" style="width:${pct}%"></div></div>`;
      barsHtml += `<span class="grid-bar-value">${score.toFixed(3)}</span>`;
      barsHtml += `</div>`;
    }
  }
  document.getElementById("diag-grid-bars").innerHTML = barsHtml;
  let infoHtml = "";
  infoHtml += `<div class="diag-item"><span class="label">Dimensions</span><span class="value">${info.width} x ${info.height}</span></div>`;
  infoHtml += `<div class="diag-item"><span class="label">Unique colors</span><span class="value">${info.uniqueColors}</span></div>`;
  document.getElementById("diag-info").innerHTML = infoHtml;
  let histHtml = "";
  if (info.histogram) {
    for (const entry of info.histogram) {
      histHtml += `<div class="color-row">`;
      histHtml += `<div class="color-swatch" style="background:${entry.hex}"></div>`;
      histHtml += `<span class="color-hex">${entry.hex}</span>`;
      histHtml += `<div class="color-bar-track"><div class="color-bar-fill" style="width:${Math.min(entry.percent, 100)}%;background:${entry.hex}"></div></div>`;
      histHtml += `<span class="color-percent">${entry.percent.toFixed(1)}%</span>`;
      histHtml += `</div>`;
    }
  }
  document.getElementById("diag-histogram").innerHTML = histHtml;
}
async function loadImageBlob(which) {
  const bytes = await invoke("get_image", { which });
  const arr = new Uint8Array(bytes);
  const blob = new Blob([arr], { type: "image/png" });
  return URL.createObjectURL(blob);
}
async function openImage(path) {
  setStatus("Loading image...", "processing");
  const wasOnWelcome = document.getElementById("welcome").style.display !== "none";
  if (wasOnWelcome) {
    showWelcomeLoading();
  }
  try {
    const info = await invoke("open_image", { path });
    state.imageLoaded = true;
    state.imagePath = path;
    state.imageInfo = info;
    state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    state.lospecResult = null;
    state.lospecError = null;
    state.paletteColors = null;
    const fname = path.split("/").pop().split("\\").pop();
    document.getElementById("filename").textContent = fname;
    hideWelcomeLoading();
    document.getElementById("welcome").style.display = "none";
    document.getElementById("original-pane").style.display = "flex";
    document.getElementById("processed-pane").style.display = "flex";
    const [origUrl, procUrl] = await Promise.all([
      loadImageBlob("original"),
      loadImageBlob("processed")
    ]);
    document.getElementById("original-img").src = origUrl;
    document.getElementById("processed-img").src = procUrl;
    document.getElementById("original-dims").textContent = `${info.width}\xD7${info.height}`;
    document.getElementById("processed-dims").textContent = `${info.width}\xD7${info.height}`;
    document.getElementById("settings-preview-img").src = procUrl;
    document.getElementById("settings-preview-img").style.display = "block";
    document.getElementById("settings-no-image").style.display = "none";
    renderSettings();
    renderDiagnostics();
    setStatus(`Loaded \u2014 ${info.width}\xD7${info.height}, grid=${info.gridSize ?? "none"}, ${info.uniqueColors} colors`, "success");
  } catch (e) {
    hideWelcomeLoading();
    setStatus("Error: " + e, "error");
  }
}
function buildProcessConfig() {
  const c = state.config;
  return {
    gridSize: c.gridSize,
    gridPhaseX: c.gridPhaseX,
    gridPhaseY: c.gridPhaseY,
    maxGridCandidate: c.maxGridCandidate === 32 ? null : c.maxGridCandidate,
    noGridDetect: c.noGridDetect,
    downscaleMode: c.downscaleMode,
    aaThreshold: c.aaThreshold,
    paletteName: c.paletteName,
    autoColors: c.autoColors,
    customPalette: c.customPalette,
    noQuantize: c.noQuantize,
    removeBg: c.removeBg,
    bgColor: c.bgColor,
    borderThreshold: c.borderThreshold,
    bgTolerance: c.bgTolerance,
    floodFill: c.floodFill,
    outputScale: c.outputScale,
    outputWidth: c.outputWidth,
    outputHeight: c.outputHeight
  };
}
async function processImage() {
  if (!state.imageLoaded || state.processing)
    return;
  state.processing = true;
  setStatus("Processing...", "processing");
  const t0 = performance.now();
  try {
    const result = await invoke("process", { pc: buildProcessConfig() });
    state.imageInfo = { ...state.imageInfo, ...result };
    const procUrl = await loadImageBlob("processed");
    document.getElementById("processed-img").src = procUrl;
    document.getElementById("processed-dims").textContent = `${result.width}\xD7${result.height}`;
    document.getElementById("settings-preview-img").src = procUrl;
    renderDiagnostics();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    state.lastProcessTime = performance.now() - t0;
    setStatus(`Processed \u2014 ${result.width}\xD7${result.height}, ${result.uniqueColors} colors (${elapsed}s)`, "success");
  } catch (e) {
    setStatus("Error: " + e, "error");
  } finally {
    state.processing = false;
  }
}
async function doOpen() {
  try {
    const result = await openDialog({
      multiple: false,
      filters: [{
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"]
      }]
    });
    if (result) {
      await openImage(result);
    }
  } catch (e) {
    setStatus("Error: " + e, "error");
  }
}
async function doSave() {
  if (!state.imageLoaded)
    return;
  try {
    const result = await saveDialog({
      defaultPath: state.imagePath ? state.imagePath.replace(/\.[^.]+$/, "_fixed.png") : "output.png",
      filters: [{
        name: "PNG Image",
        extensions: ["png"]
      }]
    });
    if (result) {
      await invoke("save_image", { path: result });
      setStatus("Saved: " + result.split("/").pop().split("\\").pop(), "success");
    }
  } catch (e) {
    setStatus("Error: " + e, "error");
  }
}
document.addEventListener("keydown", (e) => {
  if (e.target.classList?.contains("setting-inline-input")) {
    if (e.key === "Enter") {
      e.preventDefault();
      const target = e.target;
      commitEdit(target.dataset.key, target.value);
      target.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.target.blur();
      renderSettings();
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.target.blur();
      cycleTab(e.shiftKey ? -1 : 1);
    }
    return;
  }
  if (e.target.classList?.contains("setting-inline-select")) {
    if (e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    }
    return;
  }
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    if (e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    }
    return;
  }
  const key = e.key;
  if (key === "Tab") {
    e.preventDefault();
    cycleTab(e.shiftKey ? -1 : 1);
    return;
  }
  if (key === "o") {
    doOpen();
    return;
  }
  if (key === "s") {
    doSave();
    return;
  }
  if (key === " ") {
    e.preventDefault();
    processImage();
    return;
  }
  if (key === "r") {
    resetConfig();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === "q") {
    window.close();
    return;
  }
  if (state.activeTab === "settings" && !state.processing) {
    const rows = getSettingRows();
    if (key === "j" || key === "ArrowDown") {
      e.preventDefault();
      state.settingsFocusIndex = Math.min(state.settingsFocusIndex + 1, rows.length - 1);
      renderSettings();
      return;
    }
    if (key === "k" || key === "ArrowUp") {
      e.preventDefault();
      state.settingsFocusIndex = Math.max(state.settingsFocusIndex - 1, 0);
      renderSettings();
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      const row = rows[state.settingsFocusIndex];
      if (row)
        startEditing(row.key);
      return;
    }
    if (key === "Escape") {
      e.preventDefault();
      switchTab("preview");
      return;
    }
    if (key === "l" || key === "ArrowRight") {
      e.preventDefault();
      const row = rows[state.settingsFocusIndex];
      if (row) {
        adjustSetting(row.key, 1);
        renderSettings();
        autoProcess();
      }
      return;
    }
    if (key === "h" || key === "ArrowLeft") {
      e.preventDefault();
      const row = rows[state.settingsFocusIndex];
      if (row) {
        adjustSetting(row.key, -1);
        renderSettings();
        autoProcess();
      }
      return;
    }
  }
});
var TABS = ["preview", "settings", "diagnostics", "batch", "sheet"];
function cycleTab(dir) {
  let idx = TABS.indexOf(state.activeTab);
  idx = (idx + dir + TABS.length) % TABS.length;
  switchTab(TABS[idx]);
}
function resetConfig() {
  state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  state.lospecResult = null;
  state.lospecError = null;
  state.paletteColors = null;
  renderSettings();
  if (state.imageLoaded) {
    autoProcess();
  }
  setStatus("Config reset to defaults");
}
var processTimer = null;
function autoProcess() {
  if (!state.imageLoaded)
    return;
  if (processTimer)
    clearTimeout(processTimer);
  processTimer = setTimeout(() => processImage(), 150);
}
function renderBatch() {
  const el = document.getElementById("batch-content");
  let html = "";
  html += '<div class="batch-section">';
  html += '<div class="batch-title">Batch Processing</div>';
  html += '<div class="batch-desc">Process multiple images with the current pipeline settings.</div>';
  html += "</div>";
  html += '<div class="batch-section">';
  html += `<div class="batch-row"><span class="batch-label">Files</span><span class="batch-value">${state.batchFiles.length} selected</span>`;
  html += `<button class="batch-btn" id="batch-add-files"${state.batchRunning ? " disabled" : ""}>Add Files</button>`;
  if (state.batchFiles.length > 0) {
    html += `<button class="batch-btn batch-btn-dim" id="batch-clear-files"${state.batchRunning ? " disabled" : ""}>Clear</button>`;
  }
  html += "</div>";
  if (state.batchFiles.length > 0) {
    html += '<div class="batch-file-list">';
    for (const f of state.batchFiles) {
      const name = f.split("/").pop().split("\\").pop();
      html += `<div class="batch-file">${escapeHtml(name)}</div>`;
    }
    html += "</div>";
  }
  html += "</div>";
  html += '<div class="batch-section">';
  html += `<div class="batch-row"><span class="batch-label">Output</span><span class="batch-value">${state.batchOutputDir ? escapeHtml(state.batchOutputDir.split("/").pop().split("\\").pop()) : "not set"}</span>`;
  html += `<button class="batch-btn" id="batch-choose-dir"${state.batchRunning ? " disabled" : ""}>Choose Folder</button>`;
  html += "</div>";
  html += "</div>";
  const canRun = state.batchFiles.length > 0 && state.batchOutputDir && !state.batchRunning;
  html += '<div class="batch-section">';
  html += `<button class="batch-btn batch-btn-primary" id="batch-run"${canRun ? "" : " disabled"}>Process All</button>`;
  html += "</div>";
  if (state.batchProgress) {
    const pct = Math.round(state.batchProgress.current / state.batchProgress.total * 100);
    html += '<div class="batch-section">';
    html += `<div class="batch-progress-info">${state.batchProgress.current}/${state.batchProgress.total} &mdash; ${escapeHtml(state.batchProgress.filename)}</div>`;
    html += `<div class="batch-progress-bar"><div class="batch-progress-fill" style="width:${pct}%"></div></div>`;
    html += "</div>";
  }
  if (state.batchResult) {
    const r = state.batchResult;
    html += '<div class="batch-section">';
    html += `<div class="batch-result-summary">${r.succeeded} succeeded`;
    if (r.failed.length > 0) {
      html += `, <span class="batch-result-failed">${r.failed.length} failed</span>`;
    }
    html += "</div>";
    if (r.failed.length > 0) {
      html += '<div class="batch-errors">';
      for (const f of r.failed) {
        const name = f.path.split("/").pop().split("\\").pop();
        html += `<div class="batch-error">${escapeHtml(name)}: ${escapeHtml(f.error)}</div>`;
      }
      html += "</div>";
    }
    html += "</div>";
  }
  el.innerHTML = html;
}
async function batchAddFiles() {
  try {
    const result = await openDialog({
      multiple: true,
      filters: [{
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"]
      }]
    });
    if (result) {
      const paths = Array.isArray(result) ? result : [result];
      const existing = new Set(state.batchFiles);
      for (const p of paths) {
        if (p && !existing.has(p)) {
          state.batchFiles.push(p);
          existing.add(p);
        }
      }
      renderBatch();
    }
  } catch (e) {
    setStatus("Error: " + e, "error");
  }
}
async function batchChooseDir() {
  try {
    const result = await openDialog({
      directory: true
    });
    if (result) {
      state.batchOutputDir = Array.isArray(result) ? result[0] : result;
      renderBatch();
    }
  } catch (e) {
    setStatus("Error: " + e, "error");
  }
}
async function batchRun() {
  if (state.batchRunning || state.batchFiles.length === 0 || !state.batchOutputDir)
    return;
  state.batchRunning = true;
  state.batchResult = null;
  state.batchProgress = { current: 0, total: state.batchFiles.length, filename: "" };
  renderBatch();
  setStatus("Batch processing...", "processing");
  const unlisten = await window.__TAURI__.event.listen("batch-progress", (event) => {
    state.batchProgress = event.payload;
    renderBatch();
  });
  try {
    const result = await invoke("batch_process", {
      inputPaths: state.batchFiles,
      outputDir: state.batchOutputDir,
      pc: buildProcessConfig(),
      overwrite: false
    });
    state.batchResult = result;
    setStatus(`Batch done: ${result.succeeded} succeeded, ${result.failed.length} failed`, result.failed.length > 0 ? "error" : "success");
  } catch (e) {
    setStatus("Batch error: " + e, "error");
  } finally {
    state.batchRunning = false;
    state.batchProgress = null;
    if (typeof unlisten === "function")
      unlisten();
    renderBatch();
  }
}
function renderSheet() {
  const el = document.getElementById("sheet-content");
  const sc = state.sheetConfig;
  const dis = state.sheetProcessing ? " disabled" : "";
  let html = "";
  html += '<div class="sheet-section">';
  html += '<div class="sheet-title">Sprite Sheet Processing</div>';
  html += '<div class="sheet-desc">Split a sprite sheet into individual tiles, run the normalize pipeline on each one, then reassemble into a clean sheet. You can also export each tile as a separate file or generate an animated GIF.</div>';
  if (!state.imageLoaded) {
    html += '<div class="sheet-desc" style="color:var(--yellow);margin-top:6px">Load an image first in the Preview tab.</div>';
  }
  html += "</div>";
  html += '<div class="sheet-section">';
  html += '<div class="sheet-setting-label" style="margin-bottom:4px">Split Mode</div>';
  html += '<div class="sheet-mode-toggle">';
  html += `<button class="sheet-mode-btn${state.sheetMode === "fixed" ? " active" : ""}" data-mode="fixed">Fixed Grid</button>`;
  html += `<button class="sheet-mode-btn${state.sheetMode === "auto" ? " active" : ""}" data-mode="auto">Auto-Split</button>`;
  html += "</div>";
  if (state.sheetMode === "fixed") {
    html += '<div class="sheet-help">Use when your sheet has a uniform grid &mdash; all tiles are the same size with consistent spacing.</div>';
  } else {
    html += '<div class="sheet-help">Use when tiles are different sizes or irregularly placed. Detects sprites automatically by finding separator rows/columns. <strong>Sprites must be on a pure white background.</strong></div>';
  }
  html += "</div>";
  html += '<div class="sheet-section">';
  if (state.sheetMode === "fixed") {
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Tile Width</span>';
    html += `<input class="sheet-input" type="number" id="sheet-tw" value="${sc.tileWidth ?? ""}" placeholder="px"${dis}></div>`;
    html += '<div class="sheet-help">Width of each tile in pixels. Required.</div>';
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Tile Height</span>';
    html += `<input class="sheet-input" type="number" id="sheet-th" value="${sc.tileHeight ?? ""}" placeholder="px"${dis}></div>`;
    html += '<div class="sheet-help">Height of each tile in pixels. Required.</div>';
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Spacing</span>';
    html += `<input class="sheet-input" type="number" id="sheet-sp" value="${sc.spacing}" placeholder="0"${dis}></div>`;
    html += '<div class="sheet-help">Gap between tiles in pixels. Set to 0 if tiles are packed edge-to-edge.</div>';
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Margin</span>';
    html += `<input class="sheet-input" type="number" id="sheet-mg" value="${sc.margin}" placeholder="0"${dis}></div>`;
    html += '<div class="sheet-help">Border around the entire sheet in pixels. Usually 0.</div>';
  } else {
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Sep. Threshold</span>';
    html += `<input class="sheet-input" type="number" id="sheet-sep" value="${sc.separatorThreshold}" step="0.05" min="0" max="1"${dis}></div>`;
    html += '<div class="sheet-help">How uniform a row/column must be to count as a separator (0&ndash;1). Higher = stricter. 0.90 works for most sheets.</div>';
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Min Sprite Size</span>';
    html += `<input class="sheet-input" type="number" id="sheet-min" value="${sc.minSpriteSize}" min="1"${dis}></div>`;
    html += '<div class="sheet-help">Ignore detected regions smaller than this many pixels. Filters out noise and tiny fragments.</div>';
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Padding</span>';
    html += `<input class="sheet-input" type="number" id="sheet-pad" value="${sc.pad}" min="0"${dis}></div>`;
    html += '<div class="sheet-help">Extra pixels to include around each detected sprite. Useful if auto-detection crops too tightly.</div>';
  }
  html += "</div>";
  html += '<div class="sheet-section">';
  html += '<div class="sheet-setting"><span class="sheet-setting-label">Skip Normalize</span>';
  html += `<button class="batch-btn batch-btn-dim" id="sheet-no-normalize" style="min-width:40px"${dis}>${sc.noNormalize ? "on" : "off"}</button></div>`;
  html += '<div class="sheet-help">When on, tiles are split and reassembled without running the pipeline. Useful for just extracting or rearranging tiles.</div>';
  html += "</div>";
  const canAct = state.imageLoaded && !state.sheetProcessing;
  html += '<div class="sheet-section">';
  html += '<div class="sheet-actions">';
  html += `<button class="batch-btn" id="sheet-preview-btn"${canAct ? "" : " disabled"}>Preview Split</button>`;
  html += `<button class="batch-btn batch-btn-primary" id="sheet-process-btn"${canAct ? "" : " disabled"}>Process Sheet</button>`;
  html += `<button class="batch-btn" id="sheet-save-tiles-btn"${state.sheetPreview && !state.sheetProcessing ? "" : " disabled"}>Save Tiles</button>`;
  html += "</div>";
  html += '<div class="sheet-help"><strong>Preview Split</strong> shows how many tiles will be extracted. <strong>Process Sheet</strong> runs the normalize pipeline on each tile and reassembles. <strong>Save Tiles</strong> exports each tile as a separate PNG.</div>';
  html += "</div>";
  if (state.sheetPreview) {
    const p = state.sheetPreview;
    html += '<div class="sheet-section">';
    html += `<div class="sheet-info">${p.tileCount} tiles &mdash; ${p.cols}\xD7${p.rows} grid &mdash; ${p.tileWidth}\xD7${p.tileHeight}px each</div>`;
    html += "</div>";
    const gifDis = state.gifGenerating ? " disabled" : "";
    html += '<div class="sheet-section">';
    html += '<div class="sheet-title" style="margin-top:4px">GIF Animation</div>';
    html += '<div class="sheet-help">Generate an animated GIF from the processed tiles. Preview it here or export to a file.</div>';
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Animate</span>';
    html += '<div class="sheet-mode-toggle">';
    html += `<button class="sheet-mode-btn gif-mode-btn${state.gifMode === "row" ? " active" : ""}" data-gif-mode="row"${gifDis}>By Row</button>`;
    html += `<button class="sheet-mode-btn gif-mode-btn${state.gifMode === "all" ? " active" : ""}" data-gif-mode="all"${gifDis}>Entire Sheet</button>`;
    html += "</div></div>";
    if (state.gifMode === "row") {
      html += '<div class="sheet-setting"><span class="sheet-setting-label">Row</span>';
      html += `<input class="sheet-input" type="number" id="gif-row" value="${state.gifRow}" min="0" max="${p.rows - 1}"${gifDis}></div>`;
      html += `<div class="sheet-help">Which row to animate (0\u2013${p.rows - 1}). Each row becomes one animation sequence.</div>`;
    }
    html += '<div class="sheet-setting"><span class="sheet-setting-label">Frame Rate</span>';
    html += `<input class="sheet-input" type="number" id="gif-fps" value="${state.gifFps}" min="1" max="100"${gifDis}></div>`;
    html += '<div class="sheet-help">Frames per second (1\u2013100). 10 fps is a good default for pixel art animations.</div>';
    html += '<div class="sheet-actions" style="margin-top:4px">';
    html += `<button class="batch-btn batch-btn-primary" id="gif-preview-btn"${gifDis}>Preview GIF</button>`;
    html += `<button class="batch-btn" id="gif-export-btn"${state.gifPreviewUrl && !state.gifGenerating ? "" : " disabled"}>Export GIF</button>`;
    html += "</div>";
    if (state.gifGenerating) {
      html += '<div class="sheet-info" style="color:var(--mauve);margin-top:6px">Generating GIF...</div>';
    }
    if (state.gifPreviewUrl) {
      html += '<div class="gif-preview-container">';
      html += `<img class="gif-preview-img" src="${state.gifPreviewUrl}" alt="GIF Preview">`;
      html += "</div>";
    }
    html += "</div>";
  }
  if (state.sheetProcessing) {
    html += '<div class="sheet-section"><div class="sheet-info" style="color:var(--mauve)">Processing...</div></div>';
  }
  el.innerHTML = html;
}
function readSheetConfig() {
  const sc = state.sheetConfig;
  if (state.sheetMode === "fixed") {
    const tw = document.getElementById("sheet-tw");
    const th = document.getElementById("sheet-th");
    const sp = document.getElementById("sheet-sp");
    const mg = document.getElementById("sheet-mg");
    if (tw) {
      const v = parseInt(tw.value);
      sc.tileWidth = isNaN(v) || v < 1 ? null : v;
    }
    if (th) {
      const v = parseInt(th.value);
      sc.tileHeight = isNaN(v) || v < 1 ? null : v;
    }
    if (sp) {
      const v = parseInt(sp.value);
      sc.spacing = isNaN(v) ? 0 : Math.max(0, v);
    }
    if (mg) {
      const v = parseInt(mg.value);
      sc.margin = isNaN(v) ? 0 : Math.max(0, v);
    }
  } else {
    const sep = document.getElementById("sheet-sep");
    const min = document.getElementById("sheet-min");
    const pad = document.getElementById("sheet-pad");
    if (sep) {
      const v = parseFloat(sep.value);
      sc.separatorThreshold = isNaN(v) ? 0.9 : Math.max(0, Math.min(1, v));
    }
    if (min) {
      const v = parseInt(min.value);
      sc.minSpriteSize = isNaN(v) ? 8 : Math.max(1, v);
    }
    if (pad) {
      const v = parseInt(pad.value);
      sc.pad = isNaN(v) ? 0 : Math.max(0, v);
    }
  }
}
function buildSheetArgs() {
  const sc = state.sheetConfig;
  return {
    mode: state.sheetMode,
    tileWidth: sc.tileWidth,
    tileHeight: sc.tileHeight,
    spacing: sc.spacing,
    margin: sc.margin,
    separatorThreshold: sc.separatorThreshold,
    minSpriteSize: sc.minSpriteSize,
    pad: sc.pad,
    noNormalize: sc.noNormalize || null
  };
}
async function sheetPreviewAction() {
  if (!state.imageLoaded || state.sheetProcessing)
    return;
  readSheetConfig();
  state.sheetProcessing = true;
  renderSheet();
  try {
    const result = await invoke("sheet_preview", buildSheetArgs());
    state.sheetPreview = result;
    setStatus(`Sheet: ${result.tileCount} tiles (${result.cols}\xD7${result.rows})`, "success");
  } catch (e) {
    setStatus("Sheet error: " + e, "error");
    state.sheetPreview = null;
  } finally {
    state.sheetProcessing = false;
    renderSheet();
  }
}
async function sheetProcessAction() {
  if (!state.imageLoaded || state.sheetProcessing)
    return;
  readSheetConfig();
  state.sheetProcessing = true;
  state.gifPreviewUrl = null;
  renderSheet();
  setStatus("Processing sheet...", "processing");
  const t0 = performance.now();
  try {
    const args = { ...buildSheetArgs(), pc: buildProcessConfig() };
    const result = await invoke("sheet_process", args);
    state.sheetPreview = result;
    const procUrl = await loadImageBlob("processed");
    document.getElementById("processed-img").src = procUrl;
    document.getElementById("processed-dims").textContent = `${result.outputWidth}\xD7${result.outputHeight}`;
    document.getElementById("settings-preview-img").src = procUrl;
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    setStatus(`Sheet processed: ${result.tileCount} tiles, ${result.outputWidth}\xD7${result.outputHeight} (${elapsed}s)`, "success");
  } catch (e) {
    setStatus("Sheet error: " + e, "error");
  } finally {
    state.sheetProcessing = false;
    renderSheet();
  }
}
async function sheetSaveTilesAction() {
  try {
    const result = await openDialog({ directory: true });
    if (result) {
      const dir = Array.isArray(result) ? result[0] : result;
      const count = await invoke("sheet_save_tiles", { outputDir: dir });
      setStatus(`Saved ${count} tiles to ${dir.split("/").pop().split("\\").pop()}`, "success");
    }
  } catch (e) {
    setStatus("Error saving tiles: " + e, "error");
  }
}
function readGifConfig() {
  const rowEl = document.getElementById("gif-row");
  const fpsEl = document.getElementById("gif-fps");
  if (rowEl) {
    const v = parseInt(rowEl.value);
    state.gifRow = isNaN(v) ? 0 : Math.max(0, v);
  }
  if (fpsEl) {
    const v = parseInt(fpsEl.value);
    state.gifFps = isNaN(v) ? 10 : Math.max(1, Math.min(100, v));
  }
}
async function gifPreviewAction() {
  if (state.gifGenerating)
    return;
  readGifConfig();
  state.gifGenerating = true;
  state.gifPreviewUrl = null;
  renderSheet();
  setStatus("Generating GIF preview...", "processing");
  try {
    const dataUrl = await invoke("sheet_generate_gif", {
      mode: state.gifMode,
      row: state.gifMode === "row" ? state.gifRow : null,
      fps: state.gifFps
    });
    state.gifPreviewUrl = dataUrl;
    setStatus("GIF preview generated", "success");
  } catch (e) {
    setStatus("GIF error: " + e, "error");
  } finally {
    state.gifGenerating = false;
    renderSheet();
  }
}
async function gifExportAction() {
  if (!state.gifPreviewUrl)
    return;
  readGifConfig();
  try {
    const defaultName = state.gifMode === "row" ? `row_${state.gifRow}.gif` : "animation.gif";
    const path = await saveDialog({
      filters: [{ name: "GIF", extensions: ["gif"] }],
      defaultPath: defaultName
    });
    if (path) {
      setStatus("Exporting GIF...", "processing");
      await invoke("sheet_export_gif", {
        path,
        mode: state.gifMode,
        row: state.gifMode === "row" ? state.gifRow : null,
        fps: state.gifFps
      });
      const fname = path.split("/").pop().split("\\").pop();
      setStatus(`GIF saved to ${fname}`, "success");
    }
  } catch (e) {
    setStatus("GIF export error: " + e, "error");
  }
}
document.querySelector(".tab-bar").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab)
    switchTab(tab.dataset.tab);
});
var dropOverlay = document.getElementById("drop-overlay");
var dragCounter = 0;
document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add("active");
});
document.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove("active");
  }
});
document.addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove("active");
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.path) {
      await openImage(file.path);
    }
  }
});
if (window.__TAURI__?.event) {
  window.__TAURI__.event.listen("tauri://drag-drop", async (event) => {
    dropOverlay.classList.remove("active");
    dragCounter = 0;
    const paths = event.payload?.paths;
    if (paths && paths.length > 0) {
      await openImage(paths[0]);
    }
  });
  window.__TAURI__.event.listen("tauri://drag-enter", () => {
    dropOverlay.classList.add("active");
  });
  window.__TAURI__.event.listen("tauri://drag-leave", () => {
    dropOverlay.classList.remove("active");
    dragCounter = 0;
  });
}
document.getElementById("settings-list").addEventListener("click", (e) => {
  const target = e.target;
  if (target.classList?.contains("setting-clear") && !state.processing) {
    skipNextBlurCommit = true;
    const key = target.dataset.key;
    clearSetting(key);
    return;
  }
  if (target.classList?.contains("setting-toggle") && !state.processing) {
    const key = target.dataset.key;
    const row2 = target.closest(".setting-row");
    if (row2)
      state.settingsFocusIndex = parseInt(row2.dataset.index);
    if (BOOLEAN_SETTINGS.includes(key)) {
      adjustSetting(key, 1);
      renderSettings();
      autoProcess();
    } else {
      startEditing(key);
    }
    return;
  }
  const row = target.closest(".setting-row");
  if (row) {
    state.settingsFocusIndex = parseInt(row.dataset.index);
    renderSettings();
  }
});
var skipNextBlurCommit = false;
document.getElementById("settings-list").addEventListener("focusout", (e) => {
  const target = e.target;
  if (target.classList?.contains("setting-inline-input")) {
    setTimeout(() => {
      if (skipNextBlurCommit) {
        skipNextBlurCommit = false;
        return;
      }
      commitEdit(target.dataset.key, target.value);
    }, 50);
  }
});
document.getElementById("settings-list").addEventListener("change", (e) => {
  const target = e.target;
  if (target.tagName === "SELECT" && target.classList?.contains("setting-inline-select")) {
    commitEdit(target.dataset.key, target.value);
  }
});
async function init() {
  try {
    state.palettes = await invoke("list_palettes");
  } catch (e) {
    console.error("Failed to load palettes:", e);
  }
  renderSettings();
  renderDiagnostics();
  renderBatch();
  renderSheet();
}
document.getElementById("batch-content").addEventListener("click", (e) => {
  const target = e.target;
  if (target.id === "batch-add-files") {
    batchAddFiles();
    return;
  }
  if (target.id === "batch-clear-files") {
    state.batchFiles = [];
    state.batchResult = null;
    renderBatch();
    return;
  }
  if (target.id === "batch-choose-dir") {
    batchChooseDir();
    return;
  }
  if (target.id === "batch-run") {
    batchRun();
    return;
  }
});
document.getElementById("sheet-content").addEventListener("click", (e) => {
  const target = e.target;
  if (target.classList?.contains("sheet-mode-btn") && !target.classList.contains("gif-mode-btn")) {
    const mode = target.dataset.mode;
    if (mode) {
      state.sheetMode = mode;
      state.sheetPreview = null;
      renderSheet();
    }
    return;
  }
  if (target.classList?.contains("gif-mode-btn")) {
    const gifMode = target.dataset.gifMode;
    if (gifMode) {
      state.gifMode = gifMode;
      state.gifPreviewUrl = null;
      renderSheet();
    }
    return;
  }
  if (target.id === "sheet-no-normalize") {
    state.sheetConfig.noNormalize = !state.sheetConfig.noNormalize;
    renderSheet();
    return;
  }
  if (target.id === "sheet-preview-btn") {
    sheetPreviewAction();
    return;
  }
  if (target.id === "sheet-process-btn") {
    sheetProcessAction();
    return;
  }
  if (target.id === "sheet-save-tiles-btn") {
    sheetSaveTilesAction();
    return;
  }
  if (target.id === "gif-preview-btn") {
    gifPreviewAction();
    return;
  }
  if (target.id === "gif-export-btn") {
    gifExportAction();
    return;
  }
});
init();

//# debugId=8D39E10E5EF8A03C64756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsicGl4Zml4L3VpL3NyYy9hcHAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbCiAgICAiLy8gcGl4Zml4IOKAlCBhcHBsaWNhdGlvbiBsb2dpYyAoVHlwZVNjcmlwdClcbi8vIFVzZXMgd2luZG93Ll9fVEFVUklfXyAod2l0aEdsb2JhbFRhdXJpOiB0cnVlIGluIHRhdXJpLmNvbmYuanNvbilcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUYXVyaSBBUEkgYmluZGluZ3Ncbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5kZWNsYXJlIGdsb2JhbCB7XG4gIGludGVyZmFjZSBXaW5kb3cge1xuICAgIF9fVEFVUklfXzoge1xuICAgICAgY29yZToge1xuICAgICAgICBpbnZva2U6IDxUID0gdW5rbm93bj4oY21kOiBzdHJpbmcsIGFyZ3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gUHJvbWlzZTxUPjtcbiAgICAgIH07XG4gICAgICBkaWFsb2c6IHtcbiAgICAgICAgb3BlbjogKG9wdGlvbnM/OiBEaWFsb2dPcHRpb25zKSA9PiBQcm9taXNlPHN0cmluZyB8IG51bGw+O1xuICAgICAgICBzYXZlOiAob3B0aW9ucz86IERpYWxvZ09wdGlvbnMpID0+IFByb21pc2U8c3RyaW5nIHwgbnVsbD47XG4gICAgICB9O1xuICAgICAgZXZlbnQ6IHtcbiAgICAgICAgbGlzdGVuOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBUYXVyaUV2ZW50KSA9PiB2b2lkKSA9PiBQcm9taXNlPHZvaWQ+O1xuICAgICAgfTtcbiAgICB9O1xuICB9XG59XG5cbmludGVyZmFjZSBEaWFsb2dPcHRpb25zIHtcbiAgbXVsdGlwbGU/OiBib29sZWFuO1xuICBkaXJlY3Rvcnk/OiBib29sZWFuO1xuICBkZWZhdWx0UGF0aD86IHN0cmluZztcbiAgZmlsdGVycz86IHsgbmFtZTogc3RyaW5nOyBleHRlbnNpb25zOiBzdHJpbmdbXSB9W107XG59XG5cbmludGVyZmFjZSBUYXVyaUV2ZW50IHtcbiAgcGF5bG9hZD86IHsgcGF0aHM/OiBzdHJpbmdbXSB9O1xufVxuXG5jb25zdCB7IGludm9rZSB9ID0gd2luZG93Ll9fVEFVUklfXy5jb3JlO1xuY29uc3QgeyBvcGVuOiBvcGVuRGlhbG9nLCBzYXZlOiBzYXZlRGlhbG9nIH0gPSB3aW5kb3cuX19UQVVSSV9fLmRpYWxvZztcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBCYWNrZW5kIHR5cGVzIChtaXJyb3IgUnVzdCBzZXJkZSBzdHJ1Y3RzKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJbWFnZUluZm8ge1xuICB3aWR0aDogbnVtYmVyO1xuICBoZWlnaHQ6IG51bWJlcjtcbiAgZ3JpZFNpemU6IG51bWJlciB8IG51bGw7XG4gIGdyaWRDb25maWRlbmNlOiBudW1iZXIgfCBudWxsO1xuICB1bmlxdWVDb2xvcnM6IG51bWJlcjtcbiAgZ3JpZFNjb3JlczogW251bWJlciwgbnVtYmVyXVtdO1xuICBoaXN0b2dyYW06IENvbG9yRW50cnlbXTtcbn1cblxuaW50ZXJmYWNlIFByb2Nlc3NSZXN1bHQge1xuICB3aWR0aDogbnVtYmVyO1xuICBoZWlnaHQ6IG51bWJlcjtcbiAgZ3JpZFNpemU6IG51bWJlciB8IG51bGw7XG4gIGdyaWRDb25maWRlbmNlOiBudW1iZXIgfCBudWxsO1xuICB1bmlxdWVDb2xvcnM6IG51bWJlcjtcbiAgZ3JpZFNjb3JlczogW251bWJlciwgbnVtYmVyXVtdO1xuICBoaXN0b2dyYW06IENvbG9yRW50cnlbXTtcbn1cblxuaW50ZXJmYWNlIENvbG9yRW50cnkge1xuICBoZXg6IHN0cmluZztcbiAgcjogbnVtYmVyO1xuICBnOiBudW1iZXI7XG4gIGI6IG51bWJlcjtcbiAgcGVyY2VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGFsZXR0ZUluZm8ge1xuICBuYW1lOiBzdHJpbmc7XG4gIHNsdWc6IHN0cmluZztcbiAgbnVtQ29sb3JzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBMb3NwZWNSZXN1bHQge1xuICBuYW1lOiBzdHJpbmc7XG4gIHNsdWc6IHN0cmluZztcbiAgbnVtQ29sb3JzOiBudW1iZXI7XG4gIGNvbG9yczogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBQcm9jZXNzQ29uZmlnIHtcbiAgZ3JpZFNpemU6IG51bWJlciB8IG51bGw7XG4gIGdyaWRQaGFzZVg6IG51bWJlciB8IG51bGw7XG4gIGdyaWRQaGFzZVk6IG51bWJlciB8IG51bGw7XG4gIG1heEdyaWRDYW5kaWRhdGU6IG51bWJlciB8IG51bGw7XG4gIG5vR3JpZERldGVjdDogYm9vbGVhbjtcbiAgZG93bnNjYWxlTW9kZTogc3RyaW5nO1xuICBhYVRocmVzaG9sZDogbnVtYmVyIHwgbnVsbDtcbiAgcGFsZXR0ZU5hbWU6IHN0cmluZyB8IG51bGw7XG4gIGF1dG9Db2xvcnM6IG51bWJlciB8IG51bGw7XG4gIGN1c3RvbVBhbGV0dGU6IHN0cmluZ1tdIHwgbnVsbDtcbiAgcmVtb3ZlQmc6IGJvb2xlYW47XG4gIG5vUXVhbnRpemU6IGJvb2xlYW47XG4gIGJnQ29sb3I6IHN0cmluZyB8IG51bGw7XG4gIGJvcmRlclRocmVzaG9sZDogbnVtYmVyIHwgbnVsbDtcbiAgYmdUb2xlcmFuY2U6IG51bWJlcjtcbiAgZmxvb2RGaWxsOiBib29sZWFuO1xuICBvdXRwdXRTY2FsZTogbnVtYmVyIHwgbnVsbDtcbiAgb3V0cHV0V2lkdGg6IG51bWJlciB8IG51bGw7XG4gIG91dHB1dEhlaWdodDogbnVtYmVyIHwgbnVsbDtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTdGF0ZVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBBcHBDb25maWcge1xuICBncmlkU2l6ZTogbnVtYmVyIHwgbnVsbDtcbiAgZ3JpZFBoYXNlWDogbnVtYmVyIHwgbnVsbDtcbiAgZ3JpZFBoYXNlWTogbnVtYmVyIHwgbnVsbDtcbiAgbWF4R3JpZENhbmRpZGF0ZTogbnVtYmVyO1xuICBub0dyaWREZXRlY3Q6IGJvb2xlYW47XG4gIGRvd25zY2FsZU1vZGU6IHN0cmluZztcbiAgYWFUaHJlc2hvbGQ6IG51bWJlciB8IG51bGw7XG4gIHBhbGV0dGVOYW1lOiBzdHJpbmcgfCBudWxsO1xuICBhdXRvQ29sb3JzOiBudW1iZXIgfCBudWxsO1xuICBsb3NwZWNTbHVnOiBzdHJpbmcgfCBudWxsO1xuICBjdXN0b21QYWxldHRlOiBzdHJpbmdbXSB8IG51bGw7XG4gIG5vUXVhbnRpemU6IGJvb2xlYW47XG4gIHJlbW92ZUJnOiBib29sZWFuO1xuICBiZ0NvbG9yOiBzdHJpbmcgfCBudWxsO1xuICBib3JkZXJUaHJlc2hvbGQ6IG51bWJlciB8IG51bGw7XG4gIGJnVG9sZXJhbmNlOiBudW1iZXI7XG4gIGZsb29kRmlsbDogYm9vbGVhbjtcbiAgb3V0cHV0U2NhbGU6IG51bWJlciB8IG51bGw7XG4gIG91dHB1dFdpZHRoOiBudW1iZXIgfCBudWxsO1xuICBvdXRwdXRIZWlnaHQ6IG51bWJlciB8IG51bGw7XG59XG5cbmludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIGFjdGl2ZVRhYjogc3RyaW5nO1xuICBpbWFnZUxvYWRlZDogYm9vbGVhbjtcbiAgaW1hZ2VQYXRoOiBzdHJpbmcgfCBudWxsO1xuICBpbWFnZUluZm86IEltYWdlSW5mbyB8IG51bGw7XG4gIHNldHRpbmdzRm9jdXNJbmRleDogbnVtYmVyO1xuICBwcm9jZXNzaW5nOiBib29sZWFuO1xuICBwYWxldHRlczogUGFsZXR0ZUluZm9bXTtcbiAgcGFsZXR0ZUluZGV4OiBudW1iZXI7XG4gIGNvbmZpZzogQXBwQ29uZmlnO1xuICAvLyBMb3NwZWMgc3RhdGVcbiAgbG9zcGVjUmVzdWx0OiBMb3NwZWNSZXN1bHQgfCBudWxsO1xuICBsb3NwZWNFcnJvcjogc3RyaW5nIHwgbnVsbDtcbiAgbG9zcGVjTG9hZGluZzogYm9vbGVhbjtcbiAgLy8gUGFsZXR0ZSBzd2F0Y2hlcyBmb3IgY3VycmVudCBzZWxlY3Rpb25cbiAgcGFsZXR0ZUNvbG9yczogc3RyaW5nW10gfCBudWxsO1xuICAvLyBIZWxwIHZpc2liaWxpdHlcbiAgc2hvd0FsbEhlbHA6IGJvb2xlYW47XG4gIC8vIFRpbWluZ1xuICBsYXN0UHJvY2Vzc1RpbWU6IG51bWJlciB8IG51bGw7XG4gIC8vIEJhdGNoIHN0YXRlXG4gIGJhdGNoRmlsZXM6IHN0cmluZ1tdO1xuICBiYXRjaE91dHB1dERpcjogc3RyaW5nIHwgbnVsbDtcbiAgYmF0Y2hSdW5uaW5nOiBib29sZWFuO1xuICBiYXRjaFByb2dyZXNzOiB7IGN1cnJlbnQ6IG51bWJlcjsgdG90YWw6IG51bWJlcjsgZmlsZW5hbWU6IHN0cmluZyB9IHwgbnVsbDtcbiAgYmF0Y2hSZXN1bHQ6IHsgc3VjY2VlZGVkOiBudW1iZXI7IGZhaWxlZDogeyBwYXRoOiBzdHJpbmc7IGVycm9yOiBzdHJpbmcgfVtdIH0gfCBudWxsO1xuICAvLyBTaGVldCBzdGF0ZVxuICBzaGVldE1vZGU6ICdmaXhlZCcgfCAnYXV0byc7XG4gIHNoZWV0Q29uZmlnOiB7XG4gICAgdGlsZVdpZHRoOiBudW1iZXIgfCBudWxsO1xuICAgIHRpbGVIZWlnaHQ6IG51bWJlciB8IG51bGw7XG4gICAgc3BhY2luZzogbnVtYmVyO1xuICAgIG1hcmdpbjogbnVtYmVyO1xuICAgIHNlcGFyYXRvclRocmVzaG9sZDogbnVtYmVyO1xuICAgIG1pblNwcml0ZVNpemU6IG51bWJlcjtcbiAgICBwYWQ6IG51bWJlcjtcbiAgICBub05vcm1hbGl6ZTogYm9vbGVhbjtcbiAgfTtcbiAgc2hlZXRQcmV2aWV3OiB7IHRpbGVDb3VudDogbnVtYmVyOyB0aWxlV2lkdGg6IG51bWJlcjsgdGlsZUhlaWdodDogbnVtYmVyOyBjb2xzOiBudW1iZXI7IHJvd3M6IG51bWJlciB9IHwgbnVsbDtcbiAgc2hlZXRQcm9jZXNzaW5nOiBib29sZWFuO1xuICAvLyBHSUYgYW5pbWF0aW9uIHN0YXRlXG4gIGdpZk1vZGU6ICdyb3cnIHwgJ2FsbCc7XG4gIGdpZlJvdzogbnVtYmVyO1xuICBnaWZGcHM6IG51bWJlcjtcbiAgZ2lmUHJldmlld1VybDogc3RyaW5nIHwgbnVsbDtcbiAgZ2lmR2VuZXJhdGluZzogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGU6IEFwcFN0YXRlID0ge1xuICBhY3RpdmVUYWI6ICdwcmV2aWV3JyxcbiAgaW1hZ2VMb2FkZWQ6IGZhbHNlLFxuICBpbWFnZVBhdGg6IG51bGwsXG4gIGltYWdlSW5mbzogbnVsbCxcbiAgc2V0dGluZ3NGb2N1c0luZGV4OiAwLFxuICBwcm9jZXNzaW5nOiBmYWxzZSxcbiAgcGFsZXR0ZXM6IFtdLFxuICBwYWxldHRlSW5kZXg6IDAsXG4gIGNvbmZpZzoge1xuICAgIGdyaWRTaXplOiBudWxsLFxuICAgIGdyaWRQaGFzZVg6IG51bGwsXG4gICAgZ3JpZFBoYXNlWTogbnVsbCxcbiAgICBtYXhHcmlkQ2FuZGlkYXRlOiAzMixcbiAgICBub0dyaWREZXRlY3Q6IGZhbHNlLFxuICAgIGRvd25zY2FsZU1vZGU6ICdzbmFwJyxcbiAgICBhYVRocmVzaG9sZDogbnVsbCxcbiAgICBwYWxldHRlTmFtZTogbnVsbCxcbiAgICBhdXRvQ29sb3JzOiBudWxsLFxuICAgIGxvc3BlY1NsdWc6IG51bGwsXG4gICAgY3VzdG9tUGFsZXR0ZTogbnVsbCxcbiAgICBub1F1YW50aXplOiBmYWxzZSxcbiAgICByZW1vdmVCZzogZmFsc2UsXG4gICAgYmdDb2xvcjogbnVsbCxcbiAgICBib3JkZXJUaHJlc2hvbGQ6IG51bGwsXG4gICAgYmdUb2xlcmFuY2U6IDAuMDUsXG4gICAgZmxvb2RGaWxsOiB0cnVlLFxuICAgIG91dHB1dFNjYWxlOiBudWxsLFxuICAgIG91dHB1dFdpZHRoOiBudWxsLFxuICAgIG91dHB1dEhlaWdodDogbnVsbCxcbiAgfSxcbiAgbG9zcGVjUmVzdWx0OiBudWxsLFxuICBsb3NwZWNFcnJvcjogbnVsbCxcbiAgbG9zcGVjTG9hZGluZzogZmFsc2UsXG4gIHBhbGV0dGVDb2xvcnM6IG51bGwsXG4gIHNob3dBbGxIZWxwOiBmYWxzZSxcbiAgbGFzdFByb2Nlc3NUaW1lOiBudWxsLFxuICAvLyBCYXRjaFxuICBiYXRjaEZpbGVzOiBbXSxcbiAgYmF0Y2hPdXRwdXREaXI6IG51bGwsXG4gIGJhdGNoUnVubmluZzogZmFsc2UsXG4gIGJhdGNoUHJvZ3Jlc3M6IG51bGwsXG4gIGJhdGNoUmVzdWx0OiBudWxsLFxuICAvLyBTaGVldFxuICBzaGVldE1vZGU6ICdhdXRvJyxcbiAgc2hlZXRDb25maWc6IHtcbiAgICB0aWxlV2lkdGg6IG51bGwsXG4gICAgdGlsZUhlaWdodDogbnVsbCxcbiAgICBzcGFjaW5nOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBzZXBhcmF0b3JUaHJlc2hvbGQ6IDAuOTAsXG4gICAgbWluU3ByaXRlU2l6ZTogOCxcbiAgICBwYWQ6IDAsXG4gICAgbm9Ob3JtYWxpemU6IGZhbHNlLFxuICB9LFxuICBzaGVldFByZXZpZXc6IG51bGwsXG4gIHNoZWV0UHJvY2Vzc2luZzogZmFsc2UsXG4gIC8vIEdJRlxuICBnaWZNb2RlOiAncm93JyxcbiAgZ2lmUm93OiAwLFxuICBnaWZGcHM6IDEwLFxuICBnaWZQcmV2aWV3VXJsOiBudWxsLFxuICBnaWZHZW5lcmF0aW5nOiBmYWxzZSxcbn07XG5cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBBcHBDb25maWcgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHN0YXRlLmNvbmZpZykpO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNldHRpbmdzIGRlZmluaXRpb25zXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgRE9XTlNDQUxFX01PREVTID0gWydzbmFwJywgJ2NlbnRlci13ZWlnaHRlZCcsICdtYWpvcml0eS12b3RlJywgJ2NlbnRlci1waXhlbCddO1xuXG5pbnRlcmZhY2UgU2V0dGluZ1NlY3Rpb24ge1xuICBzZWN0aW9uOiBzdHJpbmc7XG4gIGtleT86IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIFNldHRpbmdSb3cge1xuICBzZWN0aW9uPzogdW5kZWZpbmVkO1xuICBrZXk6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdmFsdWU6IHN0cmluZztcbiAgaGVscDogc3RyaW5nO1xuICBjaGFuZ2VkOiBib29sZWFuO1xufVxuXG50eXBlIFNldHRpbmdFbnRyeSA9IFNldHRpbmdTZWN0aW9uIHwgU2V0dGluZ1JvdztcblxuZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKTogU2V0dGluZ0VudHJ5W10ge1xuICBjb25zdCBjID0gc3RhdGUuY29uZmlnO1xuICByZXR1cm4gW1xuICAgIHsgc2VjdGlvbjogJ0dyaWQgRGV0ZWN0aW9uJyB9LFxuICAgIHtcbiAgICAgIGtleTogJ2dyaWRTaXplJywgbGFiZWw6ICdHcmlkIFNpemUnLFxuICAgICAgdmFsdWU6IGMuZ3JpZFNpemUgPT09IG51bGwgPyAnYXV0bycgOiBTdHJpbmcoYy5ncmlkU2l6ZSksXG4gICAgICBoZWxwOiAnSG93IG1hbnkgc2NyZWVuIHBpeGVscyBtYWtlIHVwIG9uZSBcImxvZ2ljYWxcIiBwaXhlbCBpbiB5b3VyIGFydC4gQXV0by1kZXRlY3Rpb24gd29ya3Mgd2VsbCBmb3IgbW9zdCBpbWFnZXMuIE92ZXJyaWRlIGlmIHRoZSBncmlkIGxvb2tzIHdyb25nLicsXG4gICAgICBjaGFuZ2VkOiBjLmdyaWRTaXplICE9PSBudWxsLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAnZ3JpZFBoYXNlWCcsIGxhYmVsOiAnUGhhc2UgWCcsXG4gICAgICB2YWx1ZTogYy5ncmlkUGhhc2VYID09PSBudWxsID8gJ2F1dG8nIDogU3RyaW5nKGMuZ3JpZFBoYXNlWCksXG4gICAgICBoZWxwOiAnT3ZlcnJpZGUgdGhlIFggb2Zmc2V0IG9mIHRoZSBncmlkIGFsaWdubWVudC4gVXN1YWxseSBhdXRvLWRldGVjdGVkLicsXG4gICAgICBjaGFuZ2VkOiBjLmdyaWRQaGFzZVggIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdncmlkUGhhc2VZJywgbGFiZWw6ICdQaGFzZSBZJyxcbiAgICAgIHZhbHVlOiBjLmdyaWRQaGFzZVkgPT09IG51bGwgPyAnYXV0bycgOiBTdHJpbmcoYy5ncmlkUGhhc2VZKSxcbiAgICAgIGhlbHA6ICdPdmVycmlkZSB0aGUgWSBvZmZzZXQgb2YgdGhlIGdyaWQgYWxpZ25tZW50LiBVc3VhbGx5IGF1dG8tZGV0ZWN0ZWQuJyxcbiAgICAgIGNoYW5nZWQ6IGMuZ3JpZFBoYXNlWSAhPT0gbnVsbCxcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ25vR3JpZERldGVjdCcsIGxhYmVsOiAnU2tpcCBHcmlkJyxcbiAgICAgIHZhbHVlOiBjLm5vR3JpZERldGVjdCA/ICdvbicgOiAnb2ZmJyxcbiAgICAgIGhlbHA6ICdTa2lwIGdyaWQgZGV0ZWN0aW9uIGVudGlyZWx5LiBVc2VmdWwgaWYgeW91ciBpbWFnZSBpcyBhbHJlYWR5IGF0IGxvZ2ljYWwgcmVzb2x1dGlvbi4nLFxuICAgICAgY2hhbmdlZDogYy5ub0dyaWREZXRlY3QsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdtYXhHcmlkQ2FuZGlkYXRlJywgbGFiZWw6ICdNYXggR3JpZCcsXG4gICAgICB2YWx1ZTogU3RyaW5nKGMubWF4R3JpZENhbmRpZGF0ZSksXG4gICAgICBoZWxwOiAnTWF4aW11bSBncmlkIHNpemUgdG8gdGVzdCBkdXJpbmcgYXV0by1kZXRlY3Rpb24gKGRlZmF1bHQ6IDMyKS4nLFxuICAgICAgY2hhbmdlZDogYy5tYXhHcmlkQ2FuZGlkYXRlICE9PSAzMixcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ2Rvd25zY2FsZU1vZGUnLCBsYWJlbDogJ01vZGUnLFxuICAgICAgdmFsdWU6IGMuZG93bnNjYWxlTW9kZSxcbiAgICAgIGhlbHA6ICdIb3cgdG8gY29tYmluZSBwaXhlbHMgaW4gZWFjaCBncmlkIGNlbGwuIFwic25hcFwiIGNsZWFucyBpbi1wbGFjZSBhdCBvcmlnaW5hbCByZXNvbHV0aW9uLiBPdGhlcnMgcmVkdWNlIHRvIGxvZ2ljYWwgcGl4ZWwgcmVzb2x1dGlvbi4nLFxuICAgICAgY2hhbmdlZDogYy5kb3duc2NhbGVNb2RlICE9PSAnc25hcCcsXG4gICAgfSxcbiAgICB7IHNlY3Rpb246ICdBbnRpLUFsaWFzaW5nJyB9LFxuICAgIHtcbiAgICAgIGtleTogJ2FhVGhyZXNob2xkJywgbGFiZWw6ICdBQSBSZW1vdmFsJyxcbiAgICAgIHZhbHVlOiBjLmFhVGhyZXNob2xkID09PSBudWxsID8gJ29mZicgOiBjLmFhVGhyZXNob2xkLnRvRml4ZWQoMiksXG4gICAgICBoZWxwOiAnUmVtb3ZlcyBzb2Z0IGJsZW5kaW5nIGJldHdlZW4gY29sb3JzIGFkZGVkIGJ5IEFJIGdlbmVyYXRvcnMuIExvd2VyIHZhbHVlcyBhcmUgbW9yZSBhZ2dyZXNzaXZlLiBUcnkgMC4zMFxcdTIwMTMwLjUwIGZvciBtb3N0IGltYWdlcy4nLFxuICAgICAgY2hhbmdlZDogYy5hYVRocmVzaG9sZCAhPT0gbnVsbCxcbiAgICB9LFxuICAgIHsgc2VjdGlvbjogJ0NvbG9yIFBhbGV0dGUnIH0sXG4gICAge1xuICAgICAga2V5OiAncGFsZXR0ZU5hbWUnLCBsYWJlbDogJ1BhbGV0dGUnLFxuICAgICAgdmFsdWU6IGMucGFsZXR0ZU5hbWUgPT09IG51bGwgPyAnbm9uZScgOiBjLnBhbGV0dGVOYW1lLFxuICAgICAgaGVscDogJ1NuYXAgYWxsIGNvbG9ycyB0byBhIGNsYXNzaWMgcGl4ZWwgYXJ0IHBhbGV0dGUuIE11dHVhbGx5IGV4Y2x1c2l2ZSB3aXRoIExvc3BlYyBhbmQgQXV0byBDb2xvcnMuJyxcbiAgICAgIGNoYW5nZWQ6IGMucGFsZXR0ZU5hbWUgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdsb3NwZWNTbHVnJywgbGFiZWw6ICdMb3NwZWMnLFxuICAgICAgdmFsdWU6IGMubG9zcGVjU2x1ZyA9PT0gbnVsbCA/ICdub25lJyA6IGMubG9zcGVjU2x1ZyxcbiAgICAgIGhlbHA6ICdMb2FkIGFueSBwYWxldHRlIGZyb20gbG9zcGVjLmNvbSBieSBzbHVnIChlLmcuIFwicGljby04XCIsIFwiZW5kZXNnYS0zMlwiKS4gUHJlc3MgRW50ZXIgdG8gdHlwZSBhIHNsdWcgYW5kIGZldGNoIGl0LicsXG4gICAgICBjaGFuZ2VkOiBjLmxvc3BlY1NsdWcgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdhdXRvQ29sb3JzJywgbGFiZWw6ICdBdXRvIENvbG9ycycsXG4gICAgICB2YWx1ZTogYy5hdXRvQ29sb3JzID09PSBudWxsID8gJ29mZicgOiBTdHJpbmcoYy5hdXRvQ29sb3JzKSxcbiAgICAgIGhlbHA6ICdBdXRvLWV4dHJhY3QgdGhlIGJlc3QgTiBjb2xvcnMgZnJvbSB5b3VyIGltYWdlIHVzaW5nIGstbWVhbnMgY2x1c3RlcmluZyBpbiBPS0xBQiBjb2xvciBzcGFjZS4nLFxuICAgICAgY2hhbmdlZDogYy5hdXRvQ29sb3JzICE9PSBudWxsLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAncGFsZXR0ZUZpbGUnLCBsYWJlbDogJ0xvYWQgLmhleCcsXG4gICAgICB2YWx1ZTogYy5jdXN0b21QYWxldHRlICYmICFjLmxvc3BlY1NsdWcgPyBgJHtjLmN1c3RvbVBhbGV0dGUubGVuZ3RofSBjb2xvcnNgIDogJ25vbmUnLFxuICAgICAgaGVscDogJ0xvYWQgYSBwYWxldHRlIGZyb20gYSAuaGV4IGZpbGUgKG9uZSBoZXggY29sb3IgcGVyIGxpbmUpLiBPdmVycmlkZXMgcGFsZXR0ZSBhbmQgYXV0byBjb2xvcnMuJyxcbiAgICAgIGNoYW5nZWQ6IGMuY3VzdG9tUGFsZXR0ZSAhPT0gbnVsbCAmJiBjLmxvc3BlY1NsdWcgPT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdub1F1YW50aXplJywgbGFiZWw6ICdTa2lwIFF1YW50aXplJyxcbiAgICAgIHZhbHVlOiBjLm5vUXVhbnRpemUgPyAnb24nIDogJ29mZicsXG4gICAgICBoZWxwOiAnU2tpcCBjb2xvciBxdWFudGl6YXRpb24gZW50aXJlbHkuIFVzZWZ1bCBpZiB5b3Ugb25seSB3YW50IGdyaWQgc25hcHBpbmcgYW5kIEFBIHJlbW92YWwgd2l0aG91dCBwYWxldHRlIGNoYW5nZXMuJyxcbiAgICAgIGNoYW5nZWQ6IGMubm9RdWFudGl6ZSxcbiAgICB9LFxuICAgIHsgc2VjdGlvbjogJ0JhY2tncm91bmQnIH0sXG4gICAge1xuICAgICAga2V5OiAncmVtb3ZlQmcnLCBsYWJlbDogJ1JlbW92ZSBCRycsXG4gICAgICB2YWx1ZTogYy5yZW1vdmVCZyA/ICdvbicgOiAnb2ZmJyxcbiAgICAgIGhlbHA6ICdEZXRlY3QgYW5kIG1ha2UgdGhlIGJhY2tncm91bmQgdHJhbnNwYXJlbnQuIFRoZSBkb21pbmFudCBib3JkZXIgY29sb3IgaXMgdHJlYXRlZCBhcyBiYWNrZ3JvdW5kLicsXG4gICAgICBjaGFuZ2VkOiBjLnJlbW92ZUJnLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAnYmdDb2xvcicsIGxhYmVsOiAnQkcgQ29sb3InLFxuICAgICAgdmFsdWU6IGMuYmdDb2xvciA9PT0gbnVsbCA/ICdhdXRvJyA6IGMuYmdDb2xvcixcbiAgICAgIGhlbHA6ICdFeHBsaWNpdCBiYWNrZ3JvdW5kIGNvbG9yIGFzIGhleCAoZS5nLiBcIiNGRjAwRkZcIikuIElmIGF1dG8sIGRldGVjdHMgZnJvbSBib3JkZXIgcGl4ZWxzLicsXG4gICAgICBjaGFuZ2VkOiBjLmJnQ29sb3IgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdib3JkZXJUaHJlc2hvbGQnLCBsYWJlbDogJ0JvcmRlciBUaHJlc2gnLFxuICAgICAgdmFsdWU6IGMuYm9yZGVyVGhyZXNob2xkID09PSBudWxsID8gJzAuNDAnIDogYy5ib3JkZXJUaHJlc2hvbGQudG9GaXhlZCgyKSxcbiAgICAgIGhlbHA6ICdGcmFjdGlvbiBvZiBib3JkZXIgcGl4ZWxzIHRoYXQgbXVzdCBtYXRjaCBmb3IgYXV0by1kZXRlY3Rpb24gKDAuMFxcdTIwMTMxLjAsIGRlZmF1bHQ6IDAuNDApLicsXG4gICAgICBjaGFuZ2VkOiBjLmJvcmRlclRocmVzaG9sZCAhPT0gbnVsbCxcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ2JnVG9sZXJhbmNlJywgbGFiZWw6ICdCRyBUb2xlcmFuY2UnLFxuICAgICAgdmFsdWU6IGMuYmdUb2xlcmFuY2UudG9GaXhlZCgyKSxcbiAgICAgIGhlbHA6ICdIb3cgZGlmZmVyZW50IGEgcGl4ZWwgY2FuIGJlIGZyb20gdGhlIGJhY2tncm91bmQgY29sb3IgYW5kIHN0aWxsIGNvdW50IGFzIGJhY2tncm91bmQuIEhpZ2hlciA9IG1vcmUgYWdncmVzc2l2ZS4nLFxuICAgICAgY2hhbmdlZDogYy5iZ1RvbGVyYW5jZSAhPT0gMC4wNSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ2Zsb29kRmlsbCcsIGxhYmVsOiAnRmxvb2QgRmlsbCcsXG4gICAgICB2YWx1ZTogYy5mbG9vZEZpbGwgPyAnb24nIDogJ29mZicsXG4gICAgICBoZWxwOiAnT246IG9ubHkgcmVtb3ZlIGNvbm5lY3RlZCBiYWNrZ3JvdW5kIGZyb20gZWRnZXMuIE9mZjogcmVtb3ZlIG1hdGNoaW5nIGNvbG9yIGV2ZXJ5d2hlcmUuJyxcbiAgICAgIGNoYW5nZWQ6ICFjLmZsb29kRmlsbCxcbiAgICB9LFxuICAgIHsgc2VjdGlvbjogJ091dHB1dCcgfSxcbiAgICB7XG4gICAgICBrZXk6ICdvdXRwdXRTY2FsZScsIGxhYmVsOiAnU2NhbGUnLFxuICAgICAgdmFsdWU6IGMub3V0cHV0U2NhbGUgPT09IG51bGwgPyAnb2ZmJyA6IGMub3V0cHV0U2NhbGUgKyAneCcsXG4gICAgICBoZWxwOiAnU2NhbGUgdGhlIG91dHB1dCBieSBhbiBpbnRlZ2VyIG11bHRpcGxpZXIgKDJ4LCAzeCwgZXRjKS4gR3JlYXQgZm9yIHVwc2NhbGluZyBzcHJpdGVzIGZvciBnYW1lIGVuZ2luZXMuJyxcbiAgICAgIGNoYW5nZWQ6IGMub3V0cHV0U2NhbGUgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdvdXRwdXRXaWR0aCcsIGxhYmVsOiAnV2lkdGgnLFxuICAgICAgdmFsdWU6IGMub3V0cHV0V2lkdGggPT09IG51bGwgPyAnYXV0bycgOiBTdHJpbmcoYy5vdXRwdXRXaWR0aCksXG4gICAgICBoZWxwOiAnRXhwbGljaXQgb3V0cHV0IHdpZHRoIGluIHBpeGVscy4gT3ZlcnJpZGVzIHNjYWxlLicsXG4gICAgICBjaGFuZ2VkOiBjLm91dHB1dFdpZHRoICE9PSBudWxsLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAnb3V0cHV0SGVpZ2h0JywgbGFiZWw6ICdIZWlnaHQnLFxuICAgICAgdmFsdWU6IGMub3V0cHV0SGVpZ2h0ID09PSBudWxsID8gJ2F1dG8nIDogU3RyaW5nKGMub3V0cHV0SGVpZ2h0KSxcbiAgICAgIGhlbHA6ICdFeHBsaWNpdCBvdXRwdXQgaGVpZ2h0IGluIHBpeGVscy4gT3ZlcnJpZGVzIHNjYWxlLicsXG4gICAgICBjaGFuZ2VkOiBjLm91dHB1dEhlaWdodCAhPT0gbnVsbCxcbiAgICB9LFxuICBdO1xufVxuXG5mdW5jdGlvbiBnZXRTZXR0aW5nUm93cygpOiBTZXR0aW5nUm93W10ge1xuICByZXR1cm4gZ2V0U2V0dGluZ3MoKS5maWx0ZXIoKHMpOiBzIGlzIFNldHRpbmdSb3cgPT4gIXMuc2VjdGlvbik7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gU2V0dGluZyBhZGp1c3RtZW50IChhcnJvdyBrZXlzKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGFkanVzdFNldHRpbmcoa2V5OiBzdHJpbmcsIGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnZ3JpZFNpemUnOlxuICAgICAgaWYgKGMuZ3JpZFNpemUgPT09IG51bGwpIHtcbiAgICAgICAgYy5ncmlkU2l6ZSA9IHN0YXRlLmltYWdlSW5mbz8uZ3JpZFNpemUgfHwgNDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuZ3JpZFNpemUgPSBNYXRoLm1heCgxLCBjLmdyaWRTaXplICsgZGlyZWN0aW9uKTtcbiAgICAgICAgaWYgKGMuZ3JpZFNpemUgPT09IDEgJiYgZGlyZWN0aW9uIDwgMCkgYy5ncmlkU2l6ZSA9IG51bGw7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdncmlkUGhhc2VYJzpcbiAgICAgIGlmIChjLmdyaWRQaGFzZVggPT09IG51bGwpIHtcbiAgICAgICAgYy5ncmlkUGhhc2VYID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuZ3JpZFBoYXNlWCA9IE1hdGgubWF4KDAsIGMuZ3JpZFBoYXNlWCArIGRpcmVjdGlvbik7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdncmlkUGhhc2VZJzpcbiAgICAgIGlmIChjLmdyaWRQaGFzZVkgPT09IG51bGwpIHtcbiAgICAgICAgYy5ncmlkUGhhc2VZID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuZ3JpZFBoYXNlWSA9IE1hdGgubWF4KDAsIGMuZ3JpZFBoYXNlWSArIGRpcmVjdGlvbik7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdtYXhHcmlkQ2FuZGlkYXRlJzpcbiAgICAgIGMubWF4R3JpZENhbmRpZGF0ZSA9IE1hdGgubWF4KDIsIE1hdGgubWluKDY0LCBjLm1heEdyaWRDYW5kaWRhdGUgKyBkaXJlY3Rpb24gKiA0KSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdub0dyaWREZXRlY3QnOlxuICAgICAgYy5ub0dyaWREZXRlY3QgPSAhYy5ub0dyaWREZXRlY3Q7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdkb3duc2NhbGVNb2RlJzoge1xuICAgICAgbGV0IGlkeCA9IERPV05TQ0FMRV9NT0RFUy5pbmRleE9mKGMuZG93bnNjYWxlTW9kZSk7XG4gICAgICBpZHggPSAoaWR4ICsgZGlyZWN0aW9uICsgRE9XTlNDQUxFX01PREVTLmxlbmd0aCkgJSBET1dOU0NBTEVfTU9ERVMubGVuZ3RoO1xuICAgICAgYy5kb3duc2NhbGVNb2RlID0gRE9XTlNDQUxFX01PREVTW2lkeF07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnYWFUaHJlc2hvbGQnOlxuICAgICAgaWYgKGMuYWFUaHJlc2hvbGQgPT09IG51bGwpIHtcbiAgICAgICAgYy5hYVRocmVzaG9sZCA9IDAuNTA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjLmFhVGhyZXNob2xkID0gTWF0aC5yb3VuZCgoYy5hYVRocmVzaG9sZCArIGRpcmVjdGlvbiAqIDAuMDUpICogMTAwKSAvIDEwMDtcbiAgICAgICAgaWYgKGMuYWFUaHJlc2hvbGQgPD0gMCkgYy5hYVRocmVzaG9sZCA9IG51bGw7XG4gICAgICAgIGVsc2UgaWYgKGMuYWFUaHJlc2hvbGQgPiAxLjApIGMuYWFUaHJlc2hvbGQgPSAxLjA7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdwYWxldHRlTmFtZSc6IHtcbiAgICAgIGNvbnN0IG5hbWVzOiAoc3RyaW5nIHwgbnVsbClbXSA9IFtudWxsLCAuLi5zdGF0ZS5wYWxldHRlcy5tYXAocCA9PiBwLnNsdWcpXTtcbiAgICAgIGxldCBpZHggPSBuYW1lcy5pbmRleE9mKGMucGFsZXR0ZU5hbWUpO1xuICAgICAgaWR4ID0gKGlkeCArIGRpcmVjdGlvbiArIG5hbWVzLmxlbmd0aCkgJSBuYW1lcy5sZW5ndGg7XG4gICAgICBjLnBhbGV0dGVOYW1lID0gbmFtZXNbaWR4XTtcbiAgICAgIGlmIChjLnBhbGV0dGVOYW1lICE9PSBudWxsKSB7XG4gICAgICAgIGMuYXV0b0NvbG9ycyA9IG51bGw7XG4gICAgICAgIGMubG9zcGVjU2x1ZyA9IG51bGw7XG4gICAgICAgIGMuY3VzdG9tUGFsZXR0ZSA9IG51bGw7XG4gICAgICAgIHN0YXRlLmxvc3BlY1Jlc3VsdCA9IG51bGw7XG4gICAgICAgIGZldGNoUGFsZXR0ZUNvbG9ycyhjLnBhbGV0dGVOYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ2F1dG9Db2xvcnMnOlxuICAgICAgaWYgKGMuYXV0b0NvbG9ycyA9PT0gbnVsbCkge1xuICAgICAgICBjLmF1dG9Db2xvcnMgPSAxNjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuYXV0b0NvbG9ycyA9IE1hdGgubWF4KDIsIGMuYXV0b0NvbG9ycyArIGRpcmVjdGlvbiAqIDIpO1xuICAgICAgICBpZiAoYy5hdXRvQ29sb3JzIDw9IDIgJiYgZGlyZWN0aW9uIDwgMCkgYy5hdXRvQ29sb3JzID0gbnVsbDtcbiAgICAgICAgZWxzZSBpZiAoYy5hdXRvQ29sb3JzID4gMjU2KSBjLmF1dG9Db2xvcnMgPSAyNTY7XG4gICAgICB9XG4gICAgICBpZiAoYy5hdXRvQ29sb3JzICE9PSBudWxsKSB7XG4gICAgICAgIGMucGFsZXR0ZU5hbWUgPSBudWxsO1xuICAgICAgICBjLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgICBjLmN1c3RvbVBhbGV0dGUgPSBudWxsO1xuICAgICAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gbnVsbDtcbiAgICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3JlbW92ZUJnJzpcbiAgICAgIGMucmVtb3ZlQmcgPSAhYy5yZW1vdmVCZztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2JvcmRlclRocmVzaG9sZCc6XG4gICAgICBpZiAoYy5ib3JkZXJUaHJlc2hvbGQgPT09IG51bGwpIHtcbiAgICAgICAgYy5ib3JkZXJUaHJlc2hvbGQgPSAwLjQwO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYy5ib3JkZXJUaHJlc2hvbGQgPSBNYXRoLnJvdW5kKChjLmJvcmRlclRocmVzaG9sZCArIGRpcmVjdGlvbiAqIDAuMDUpICogMTAwKSAvIDEwMDtcbiAgICAgICAgaWYgKGMuYm9yZGVyVGhyZXNob2xkIDw9IDApIGMuYm9yZGVyVGhyZXNob2xkID0gbnVsbDtcbiAgICAgICAgZWxzZSBpZiAoYy5ib3JkZXJUaHJlc2hvbGQgPiAxLjApIGMuYm9yZGVyVGhyZXNob2xkID0gMS4wO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYmdUb2xlcmFuY2UnOlxuICAgICAgYy5iZ1RvbGVyYW5jZSA9IE1hdGgucm91bmQoKGMuYmdUb2xlcmFuY2UgKyBkaXJlY3Rpb24gKiAwLjAxKSAqIDEwMCkgLyAxMDA7XG4gICAgICBjLmJnVG9sZXJhbmNlID0gTWF0aC5tYXgoMC4wMSwgTWF0aC5taW4oMC41MCwgYy5iZ1RvbGVyYW5jZSkpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZmxvb2RGaWxsJzpcbiAgICAgIGMuZmxvb2RGaWxsID0gIWMuZmxvb2RGaWxsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0U2NhbGUnOlxuICAgICAgaWYgKGMub3V0cHV0U2NhbGUgPT09IG51bGwpIHtcbiAgICAgICAgYy5vdXRwdXRTY2FsZSA9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjLm91dHB1dFNjYWxlID0gYy5vdXRwdXRTY2FsZSArIGRpcmVjdGlvbjtcbiAgICAgICAgaWYgKGMub3V0cHV0U2NhbGUgPCAyKSBjLm91dHB1dFNjYWxlID0gbnVsbDtcbiAgICAgICAgZWxzZSBpZiAoYy5vdXRwdXRTY2FsZSA+IDE2KSBjLm91dHB1dFNjYWxlID0gMTY7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvdXRwdXRXaWR0aCc6XG4gICAgICBpZiAoYy5vdXRwdXRXaWR0aCA9PT0gbnVsbCkge1xuICAgICAgICBjLm91dHB1dFdpZHRoID0gc3RhdGUuaW1hZ2VJbmZvPy53aWR0aCB8fCA2NDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMub3V0cHV0V2lkdGggPSBNYXRoLm1heCgxLCBjLm91dHB1dFdpZHRoICsgZGlyZWN0aW9uICogOCk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvdXRwdXRIZWlnaHQnOlxuICAgICAgaWYgKGMub3V0cHV0SGVpZ2h0ID09PSBudWxsKSB7XG4gICAgICAgIGMub3V0cHV0SGVpZ2h0ID0gc3RhdGUuaW1hZ2VJbmZvPy5oZWlnaHQgfHwgNjQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjLm91dHB1dEhlaWdodCA9IE1hdGgubWF4KDEsIGMub3V0cHV0SGVpZ2h0ICsgZGlyZWN0aW9uICogOCk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFBhbGV0dGUgY29sb3JzIGZldGNoaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hQYWxldHRlQ29sb3JzKHNsdWc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvbG9ycyA9IGF3YWl0IGludm9rZTxzdHJpbmdbXT4oJ2dldF9wYWxldHRlX2NvbG9ycycsIHsgc2x1ZyB9KTtcbiAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gY29sb3JzO1xuICAgIHJlbmRlclNldHRpbmdzKCk7XG4gIH0gY2F0Y2gge1xuICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoTG9zcGVjKHNsdWc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBzdGF0ZS5sb3NwZWNMb2FkaW5nID0gdHJ1ZTtcbiAgc3RhdGUubG9zcGVjRXJyb3IgPSBudWxsO1xuICByZW5kZXJTZXR0aW5ncygpO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZTxMb3NwZWNSZXN1bHQ+KCdmZXRjaF9sb3NwZWMnLCB7IHNsdWcgfSk7XG4gICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gcmVzdWx0O1xuICAgIHN0YXRlLmNvbmZpZy5sb3NwZWNTbHVnID0gc2x1ZztcbiAgICBzdGF0ZS5jb25maWcuY3VzdG9tUGFsZXR0ZSA9IHJlc3VsdC5jb2xvcnM7XG4gICAgc3RhdGUuY29uZmlnLnBhbGV0dGVOYW1lID0gbnVsbDtcbiAgICBzdGF0ZS5jb25maWcuYXV0b0NvbG9ycyA9IG51bGw7XG4gICAgc3RhdGUucGFsZXR0ZUNvbG9ycyA9IHJlc3VsdC5jb2xvcnM7XG4gICAgc3RhdGUubG9zcGVjTG9hZGluZyA9IGZhbHNlO1xuICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgYXV0b1Byb2Nlc3MoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN0YXRlLmxvc3BlY0Vycm9yID0gU3RyaW5nKGUpO1xuICAgIHN0YXRlLmxvc3BlY0xvYWRpbmcgPSBmYWxzZTtcbiAgICByZW5kZXJTZXR0aW5ncygpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQYWxldHRlRmlsZURpYWxvZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcGVuRGlhbG9nKHtcbiAgICAgIG11bHRpcGxlOiBmYWxzZSxcbiAgICAgIGZpbHRlcnM6IFt7XG4gICAgICAgIG5hbWU6ICdQYWxldHRlIEZpbGVzJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydoZXgnLCAndHh0J10sXG4gICAgICB9XSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBjb25zdCBjb2xvcnMgPSBhd2FpdCBpbnZva2U8c3RyaW5nW10+KCdsb2FkX3BhbGV0dGVfZmlsZScsIHsgcGF0aDogcmVzdWx0IH0pO1xuICAgICAgc3RhdGUuY29uZmlnLmN1c3RvbVBhbGV0dGUgPSBjb2xvcnM7XG4gICAgICBzdGF0ZS5jb25maWcucGFsZXR0ZU5hbWUgPSBudWxsO1xuICAgICAgc3RhdGUuY29uZmlnLmF1dG9Db2xvcnMgPSBudWxsO1xuICAgICAgc3RhdGUuY29uZmlnLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBjb2xvcnM7XG4gICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgYXV0b1Byb2Nlc3MoKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yIGxvYWRpbmcgcGFsZXR0ZTogJyArIGUsICdlcnJvcicpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVUkgcmVuZGVyaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gc2V0U3RhdHVzKG1zZzogc3RyaW5nLCB0eXBlOiBzdHJpbmcgPSAnJyk6IHZvaWQge1xuICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdGF0dXMtbXNnJykhO1xuICBlbC50ZXh0Q29udGVudCA9IG1zZztcbiAgZWwuY2xhc3NOYW1lID0gJ3N0YXR1cy1tc2cnICsgKHR5cGUgPyAnICcgKyB0eXBlIDogJycpO1xuICAvLyBTaG93L2hpZGUgc3RhdHVzIGJhciBzcGlubmVyIGJhc2VkIG9uIHByb2Nlc3Npbmcgc3RhdGVcbiAgY29uc3Qgc3Bpbm5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdGF0dXMtc3Bpbm5lcicpITtcbiAgaWYgKHR5cGUgPT09ICdwcm9jZXNzaW5nJykge1xuICAgIHNwaW5uZXIuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gIH0gZWxzZSB7XG4gICAgc3Bpbm5lci5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93V2VsY29tZUxvYWRpbmcoKTogdm9pZCB7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3ZWxjb21lLWxvYWRpbmcnKSEuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcbn1cblxuZnVuY3Rpb24gaGlkZVdlbGNvbWVMb2FkaW5nKCk6IHZvaWQge1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnd2VsY29tZS1sb2FkaW5nJykhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG59XG5cbmZ1bmN0aW9uIHN3aXRjaFRhYihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgc3RhdGUuYWN0aXZlVGFiID0gbmFtZTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYicpLmZvckVhY2godCA9PiB7XG4gICAgKHQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsICh0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LnRhYiA9PT0gbmFtZSk7XG4gIH0pO1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLXBhbmVsJykuZm9yRWFjaChwID0+IHtcbiAgICAocCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgcC5pZCA9PT0gJ3BhbmVsLScgKyBuYW1lKTtcbiAgfSk7XG4gIC8vIFJlLXJlbmRlciBkeW5hbWljIHRhYnMgdG8gcmVmbGVjdCBsYXRlc3Qgc3RhdGVcbiAgaWYgKG5hbWUgPT09ICdiYXRjaCcpIHJlbmRlckJhdGNoKCk7XG4gIGlmIChuYW1lID09PSAnc2hlZXQnKSByZW5kZXJTaGVldCgpO1xufVxuXG4vLyBTZXR0aW5ncyB0aGF0IGFsd2F5cyByZW5kZXIgYXMgPHNlbGVjdD4gZHJvcGRvd25zXG5jb25zdCBTRUxFQ1RfU0VUVElOR1MgPSBbJ2Rvd25zY2FsZU1vZGUnLCAncGFsZXR0ZU5hbWUnXTtcbi8vIFNldHRpbmdzIHRoYXQgYXJlIGJvb2xlYW4gdG9nZ2xlc1xuY29uc3QgQk9PTEVBTl9TRVRUSU5HUyA9IFsncmVtb3ZlQmcnLCAnZmxvb2RGaWxsJywgJ25vR3JpZERldGVjdCcsICdub1F1YW50aXplJ107XG4vLyBTZXR0aW5ncyB0aGF0IHJlcXVpcmUgRW50ZXItdG8tZWRpdCAodGV4dC9udW1lcmljIGlucHV0KVxuY29uc3QgSU5QVVRfU0VUVElOR1MgPSBbJ2dyaWRTaXplJywgJ2dyaWRQaGFzZVgnLCAnZ3JpZFBoYXNlWScsICdtYXhHcmlkQ2FuZGlkYXRlJywgJ2FhVGhyZXNob2xkJywgJ2F1dG9Db2xvcnMnLCAnYmdDb2xvcicsICdib3JkZXJUaHJlc2hvbGQnLCAnYmdUb2xlcmFuY2UnLCAnbG9zcGVjU2x1ZycsICdvdXRwdXRTY2FsZScsICdvdXRwdXRXaWR0aCcsICdvdXRwdXRIZWlnaHQnXTtcbi8vIFNldHRpbmdzIHRoYXQgb3BlbiBhIGZpbGUgZGlhbG9nIGluc3RlYWQgb2YgZWRpdGluZ1xuY29uc3QgRklMRV9TRVRUSU5HUyA9IFsncGFsZXR0ZUZpbGUnXTtcbi8vIE51bGxhYmxlIHNldHRpbmdzIOKAlCBjYW4gYmUgdHVybmVkIG9mZiAobnVsbCkgd2l0aCBhIGNsZWFyIGJ1dHRvblxuY29uc3QgTlVMTEFCTEVfU0VUVElOR1M6IFJlY29yZDxzdHJpbmcsIHsgb2ZmTGFiZWw6IHN0cmluZzsgZGVmYXVsdFZhbHVlOiAoKSA9PiB1bmtub3duIH0+ID0ge1xuICBncmlkU2l6ZTogICAgICAgICB7IG9mZkxhYmVsOiAnYXV0bycsICBkZWZhdWx0VmFsdWU6ICgpID0+IHN0YXRlLmltYWdlSW5mbz8uZ3JpZFNpemUgfHwgNCB9LFxuICBncmlkUGhhc2VYOiAgICAgICB7IG9mZkxhYmVsOiAnYXV0bycsICBkZWZhdWx0VmFsdWU6ICgpID0+IDAgfSxcbiAgZ3JpZFBoYXNlWTogICAgICAgeyBvZmZMYWJlbDogJ2F1dG8nLCAgZGVmYXVsdFZhbHVlOiAoKSA9PiAwIH0sXG4gIGFhVGhyZXNob2xkOiAgICAgIHsgb2ZmTGFiZWw6ICdvZmYnLCAgIGRlZmF1bHRWYWx1ZTogKCkgPT4gMC41MCB9LFxuICBhdXRvQ29sb3JzOiAgICAgICB7IG9mZkxhYmVsOiAnb2ZmJywgICBkZWZhdWx0VmFsdWU6ICgpID0+IDE2IH0sXG4gIGxvc3BlY1NsdWc6ICAgICAgIHsgb2ZmTGFiZWw6ICdub25lJywgIGRlZmF1bHRWYWx1ZTogKCkgPT4gbnVsbCB9LCAvLyBsb3NwZWMgYWx3YXlzIG9wZW5zIGlucHV0XG4gIGJnQ29sb3I6ICAgICAgICAgIHsgb2ZmTGFiZWw6ICdhdXRvJywgIGRlZmF1bHRWYWx1ZTogKCkgPT4gbnVsbCB9LCAvLyBiZ0NvbG9yIG9wZW5zIGlucHV0XG4gIGJvcmRlclRocmVzaG9sZDogIHsgb2ZmTGFiZWw6ICcwLjQwJywgIGRlZmF1bHRWYWx1ZTogKCkgPT4gMC40MCB9LFxuICBvdXRwdXRTY2FsZTogICAgICB7IG9mZkxhYmVsOiAnb2ZmJywgICBkZWZhdWx0VmFsdWU6ICgpID0+IDIgfSxcbiAgb3V0cHV0V2lkdGg6ICAgICAgeyBvZmZMYWJlbDogJ2F1dG8nLCAgZGVmYXVsdFZhbHVlOiAoKSA9PiBzdGF0ZS5pbWFnZUluZm8/LndpZHRoIHx8IDY0IH0sXG4gIG91dHB1dEhlaWdodDogICAgIHsgb2ZmTGFiZWw6ICdhdXRvJywgIGRlZmF1bHRWYWx1ZTogKCkgPT4gc3RhdGUuaW1hZ2VJbmZvPy5oZWlnaHQgfHwgNjQgfSxcbn07XG5cbmZ1bmN0aW9uIHJlbmRlclNldHRpbmdzKCk6IHZvaWQge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmdzLWxpc3QnKSE7XG5cbiAgLy8gRG9uJ3QgY2xvYmJlciB0aGUgRE9NIHdoaWxlIHRoZSB1c2VyIGlzIGZvY3VzZWQgb24gYW4gaW5saW5lIGlucHV0XG4gIGNvbnN0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuICBpZiAoZm9jdXNlZCAmJiBmb2N1c2VkLmNsYXNzTGlzdD8uY29udGFpbnMoJ3NldHRpbmctaW5saW5lLWlucHV0JykgJiYgbGlzdC5jb250YWlucyhmb2N1c2VkKSkge1xuICAgIC8vIFVwZGF0ZSBub24taW5wdXQgcGFydHMgb25seTogZm9jdXMgaW5kaWNhdG9yLCBjaGFuZ2VkIGNsYXNzZXNcbiAgICB1cGRhdGVTZXR0aW5nc0ZvY3VzT25seShsaXN0KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzZXR0aW5ncyA9IGdldFNldHRpbmdzKCk7XG4gIGxldCByb3dJbmRleCA9IDA7XG4gIGxldCBodG1sID0gJyc7XG5cbiAgZm9yIChjb25zdCBzIG9mIHNldHRpbmdzKSB7XG4gICAgaWYgKHMuc2VjdGlvbikge1xuICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNldHRpbmctc2VjdGlvblwiPiR7cy5zZWN0aW9ufTwvZGl2PmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGlzRm9jdXNlZCA9IHJvd0luZGV4ID09PSBzdGF0ZS5zZXR0aW5nc0ZvY3VzSW5kZXggPyAnIGZvY3VzZWQnIDogJyc7XG4gICAgICBjb25zdCBjaGFuZ2VkID0gcy5jaGFuZ2VkID8gJyBjaGFuZ2VkJyA6ICcnO1xuXG4gICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2V0dGluZy1yb3cke2lzRm9jdXNlZH1cIiBkYXRhLWluZGV4PVwiJHtyb3dJbmRleH1cIiBkYXRhLWtleT1cIiR7cy5rZXl9XCI+YDtcbiAgICAgIGh0bWwgKz0gYDxzcGFuIGNsYXNzPVwic2V0dGluZy1pbmRpY2F0b3JcIj4mIzk2NTQ7PC9zcGFuPmA7XG4gICAgICBodG1sICs9IGA8c3BhbiBjbGFzcz1cInNldHRpbmctbGFiZWxcIj4ke3MubGFiZWx9PC9zcGFuPmA7XG4gICAgICBodG1sICs9IGA8c3BhbiBjbGFzcz1cInNldHRpbmctdmFsdWUke2NoYW5nZWR9XCI+YDtcblxuICAgICAgaWYgKFNFTEVDVF9TRVRUSU5HUy5pbmNsdWRlcyhzLmtleSkpIHtcbiAgICAgICAgLy8gQWx3YXlzIHJlbmRlciBhcyBkcm9wZG93blxuICAgICAgICBodG1sICs9IHJlbmRlcklubGluZVNlbGVjdChzLmtleSk7XG4gICAgICB9IGVsc2UgaWYgKEJPT0xFQU5fU0VUVElOR1MuaW5jbHVkZXMocy5rZXkpKSB7XG4gICAgICAgIC8vIFJlbmRlciBhcyBjbGlja2FibGUgdG9nZ2xlXG4gICAgICAgIGh0bWwgKz0gYDxzcGFuIGNsYXNzPVwic2V0dGluZy10b2dnbGVcIiBkYXRhLWtleT1cIiR7cy5rZXl9XCI+JHtlc2NhcGVIdG1sKHMudmFsdWUpfTwvc3Bhbj5gO1xuICAgICAgfSBlbHNlIGlmIChGSUxFX1NFVFRJTkdTLmluY2x1ZGVzKHMua2V5KSkge1xuICAgICAgICAvLyBGaWxlIHNldHRpbmdzOiBjbGlja2FibGUgdG8gb3BlbiBkaWFsb2csIHdpdGggY2xlYXIgYnV0dG9uIHdoZW4gYWN0aXZlXG4gICAgICAgIGlmIChzLmNoYW5nZWQpIHtcbiAgICAgICAgICBodG1sICs9IGVzY2FwZUh0bWwocy52YWx1ZSk7XG4gICAgICAgICAgaHRtbCArPSBgPHNwYW4gY2xhc3M9XCJzZXR0aW5nLWNsZWFyXCIgZGF0YS1rZXk9XCIke3Mua2V5fVwiIHRpdGxlPVwiQ2xlYXJcIj5cXHUwMGQ3PC9zcGFuPmA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaHRtbCArPSBgPHNwYW4gY2xhc3M9XCJzZXR0aW5nLXRvZ2dsZVwiIGRhdGEta2V5PVwiJHtzLmtleX1cIj4ke2VzY2FwZUh0bWwocy52YWx1ZSl9PC9zcGFuPmA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoSU5QVVRfU0VUVElOR1MuaW5jbHVkZXMocy5rZXkpKSB7XG4gICAgICAgIC8vIEFsd2F5cy12aXNpYmxlIGlubGluZSBpbnB1dFxuICAgICAgICBodG1sICs9IHJlbmRlcklubGluZUlucHV0KHMua2V5KTtcbiAgICAgICAgaWYgKHMua2V5IGluIE5VTExBQkxFX1NFVFRJTkdTICYmIHMuY2hhbmdlZCkge1xuICAgICAgICAgIGNvbnN0IG51bGxhYmxlID0gTlVMTEFCTEVfU0VUVElOR1Nbcy5rZXldO1xuICAgICAgICAgIGh0bWwgKz0gYDxzcGFuIGNsYXNzPVwic2V0dGluZy1jbGVhclwiIGRhdGEta2V5PVwiJHtzLmtleX1cIiB0aXRsZT1cIlJlc2V0IHRvICR7bnVsbGFibGUub2ZmTGFiZWx9XCI+XFx1MDBkNzwvc3Bhbj5gO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBodG1sICs9IGVzY2FwZUh0bWwocy52YWx1ZSk7XG4gICAgICB9XG5cbiAgICAgIGh0bWwgKz0gYDwvc3Bhbj5gO1xuICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgIC8vIEhlbHAgdGV4dCBhbHdheXMgdmlzaWJsZVxuICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNldHRpbmctaGVscFwiPiR7cy5oZWxwfTwvZGl2PmA7XG5cbiAgICAgIC8vIFBhbGV0dGUgc3dhdGNoZXMgKGFmdGVyIHBhbGV0dGUsIGxvc3BlYywgb3IgcGFsZXR0ZUZpbGUgcm93KVxuICAgICAgaWYgKChzLmtleSA9PT0gJ3BhbGV0dGVOYW1lJyB8fCBzLmtleSA9PT0gJ2xvc3BlY1NsdWcnIHx8IHMua2V5ID09PSAncGFsZXR0ZUZpbGUnKSAmJiBzdGF0ZS5wYWxldHRlQ29sb3JzICYmIHN0YXRlLnBhbGV0dGVDb2xvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAoKHMua2V5ID09PSAncGFsZXR0ZU5hbWUnICYmIHN0YXRlLmNvbmZpZy5wYWxldHRlTmFtZSAhPT0gbnVsbCkgfHxcbiAgICAgICAgICAgIChzLmtleSA9PT0gJ2xvc3BlY1NsdWcnICYmIHN0YXRlLmNvbmZpZy5sb3NwZWNTbHVnICE9PSBudWxsKSB8fFxuICAgICAgICAgICAgKHMua2V5ID09PSAncGFsZXR0ZUZpbGUnICYmIHN0YXRlLmNvbmZpZy5jdXN0b21QYWxldHRlICE9PSBudWxsICYmIHN0YXRlLmNvbmZpZy5sb3NwZWNTbHVnID09PSBudWxsKSkge1xuICAgICAgICAgIGh0bWwgKz0gcmVuZGVyUGFsZXR0ZVN3YXRjaGVzKHN0YXRlLnBhbGV0dGVDb2xvcnMpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIExvc3BlYyBpbmZvL2Vycm9yIGFmdGVyIGxvc3BlYyByb3dcbiAgICAgIGlmIChzLmtleSA9PT0gJ2xvc3BlY1NsdWcnKSB7XG4gICAgICAgIGlmIChzdGF0ZS5sb3NwZWNMb2FkaW5nKSB7XG4gICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImxvc3BlYy1pbmZvIGxvc3BlYy1sb2FkaW5nXCI+RmV0Y2hpbmcgcGFsZXR0ZS4uLjwvZGl2PmA7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUubG9zcGVjRXJyb3IpIHtcbiAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwibG9zcGVjLWVycm9yXCI+JHtlc2NhcGVIdG1sKHN0YXRlLmxvc3BlY0Vycm9yKX08L2Rpdj5gO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmxvc3BlY1Jlc3VsdCAmJiBzdGF0ZS5jb25maWcubG9zcGVjU2x1Zykge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJsb3NwZWMtaW5mb1wiPiR7ZXNjYXBlSHRtbChzdGF0ZS5sb3NwZWNSZXN1bHQubmFtZSl9IFxcdTIwMTQgJHtzdGF0ZS5sb3NwZWNSZXN1bHQubnVtQ29sb3JzfSBjb2xvcnM8L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJvd0luZGV4Kys7XG4gICAgfVxuICB9XG4gIGxpc3QuaW5uZXJIVE1MID0gaHRtbDtcbn1cblxuLy8gTGlnaHR3ZWlnaHQgcmUtcmVuZGVyOiBqdXN0IHVwZGF0ZSBmb2N1cy9jaGFuZ2VkIGNsYXNzZXMgd2l0aG91dCBkZXN0cm95aW5nIGlucHV0c1xuZnVuY3Rpb24gdXBkYXRlU2V0dGluZ3NGb2N1c09ubHkobGlzdDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3Qgcm93cyA9IGxpc3QucXVlcnlTZWxlY3RvckFsbCgnLnNldHRpbmctcm93Jyk7XG4gIHJvd3MuZm9yRWFjaCgocm93LCBpKSA9PiB7XG4gICAgKHJvdyBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LnRvZ2dsZSgnZm9jdXNlZCcsIGkgPT09IHN0YXRlLnNldHRpbmdzRm9jdXNJbmRleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQYWxldHRlU3dhdGNoZXMoY29sb3JzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gIGxldCBodG1sID0gJzxkaXYgY2xhc3M9XCJwYWxldHRlLXN3YXRjaGVzXCI+JztcbiAgZm9yIChjb25zdCBjb2xvciBvZiBjb2xvcnMpIHtcbiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwicGFsZXR0ZS1zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQ6JHtjb2xvcn1cIiB0aXRsZT1cIiR7Y29sb3J9XCI+PC9kaXY+YDtcbiAgfVxuICBodG1sICs9ICc8L2Rpdj4nO1xuICByZXR1cm4gaHRtbDtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbChzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcy5yZXBsYWNlKC8mL2csICcmYW1wOycpLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC8+L2csICcmZ3Q7JykucmVwbGFjZSgvXCIvZywgJyZxdW90OycpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJJbmxpbmVTZWxlY3Qoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBjID0gc3RhdGUuY29uZmlnO1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ2Rvd25zY2FsZU1vZGUnOiB7XG4gICAgICBjb25zdCBvcHRzID0gRE9XTlNDQUxFX01PREVTLm1hcChtID0+XG4gICAgICAgIGA8b3B0aW9uIHZhbHVlPVwiJHttfVwiJHttID09PSBjLmRvd25zY2FsZU1vZGUgPyAnIHNlbGVjdGVkJyA6ICcnfT4ke219PC9vcHRpb24+YFxuICAgICAgKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPHNlbGVjdCBjbGFzcz1cInNldHRpbmctaW5saW5lLXNlbGVjdFwiIGRhdGEta2V5PVwiJHtrZXl9XCI+JHtvcHRzfTwvc2VsZWN0PmA7XG4gICAgfVxuICAgIGNhc2UgJ3BhbGV0dGVOYW1lJzoge1xuICAgICAgbGV0IG9wdHMgPSBgPG9wdGlvbiB2YWx1ZT1cIlwiJHtjLnBhbGV0dGVOYW1lID09PSBudWxsID8gJyBzZWxlY3RlZCcgOiAnJ30+bm9uZTwvb3B0aW9uPmA7XG4gICAgICBvcHRzICs9IHN0YXRlLnBhbGV0dGVzLm1hcChwID0+XG4gICAgICAgIGA8b3B0aW9uIHZhbHVlPVwiJHtwLnNsdWd9XCIke3Auc2x1ZyA9PT0gYy5wYWxldHRlTmFtZSA/ICcgc2VsZWN0ZWQnIDogJyd9PiR7cC5zbHVnfSAoJHtwLm51bUNvbG9yc30pPC9vcHRpb24+YFxuICAgICAgKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPHNlbGVjdCBjbGFzcz1cInNldHRpbmctaW5saW5lLXNlbGVjdFwiIGRhdGEta2V5PVwiJHtrZXl9XCI+JHtvcHRzfTwvc2VsZWN0PmA7XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVySW5saW5lSW5wdXQoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBjID0gc3RhdGUuY29uZmlnO1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ2dyaWRTaXplJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5ncmlkU2l6ZSA9PT0gbnVsbCA/ICcnIDogYy5ncmlkU2l6ZTtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCJhdXRvXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdncmlkUGhhc2VYJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5ncmlkUGhhc2VYID09PSBudWxsID8gJycgOiBjLmdyaWRQaGFzZVg7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwiYXV0b1wiIGRhdGEta2V5PVwiJHtrZXl9XCI+YDtcbiAgICB9XG4gICAgY2FzZSAnZ3JpZFBoYXNlWSc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMuZ3JpZFBoYXNlWSA9PT0gbnVsbCA/ICcnIDogYy5ncmlkUGhhc2VZO1xuICAgICAgcmV0dXJuIGA8aW5wdXQgY2xhc3M9XCJzZXR0aW5nLWlubGluZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke3ZhbH1cIiBwbGFjZWhvbGRlcj1cImF1dG9cIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ21heEdyaWRDYW5kaWRhdGUnOiB7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7Yy5tYXhHcmlkQ2FuZGlkYXRlfVwiIGRhdGEta2V5PVwiJHtrZXl9XCI+YDtcbiAgICB9XG4gICAgY2FzZSAnYWFUaHJlc2hvbGQnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmFhVGhyZXNob2xkID09PSBudWxsID8gJycgOiBjLmFhVGhyZXNob2xkLnRvRml4ZWQoMik7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwib2ZmXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdhdXRvQ29sb3JzJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5hdXRvQ29sb3JzID09PSBudWxsID8gJycgOiBjLmF1dG9Db2xvcnM7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwib2ZmXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdiZ0NvbG9yJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5iZ0NvbG9yID8/ICcnO1xuICAgICAgcmV0dXJuIGA8aW5wdXQgY2xhc3M9XCJzZXR0aW5nLWlubGluZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwodmFsKX1cIiBwbGFjZWhvbGRlcj1cImF1dG8gKCNSUkdHQkIpXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdib3JkZXJUaHJlc2hvbGQnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmJvcmRlclRocmVzaG9sZCA9PT0gbnVsbCA/ICcnIDogYy5ib3JkZXJUaHJlc2hvbGQudG9GaXhlZCgyKTtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCIwLjQwXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdiZ1RvbGVyYW5jZSc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMuYmdUb2xlcmFuY2UudG9GaXhlZCgyKTtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdvdXRwdXRTY2FsZSc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMub3V0cHV0U2NhbGUgPT09IG51bGwgPyAnJyA6IGMub3V0cHV0U2NhbGU7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwib2ZmXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdvdXRwdXRXaWR0aCc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMub3V0cHV0V2lkdGggPT09IG51bGwgPyAnJyA6IGMub3V0cHV0V2lkdGg7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwiYXV0b1wiIGRhdGEta2V5PVwiJHtrZXl9XCI+YDtcbiAgICB9XG4gICAgY2FzZSAnb3V0cHV0SGVpZ2h0Jzoge1xuICAgICAgY29uc3QgdmFsID0gYy5vdXRwdXRIZWlnaHQgPT09IG51bGwgPyAnJyA6IGMub3V0cHV0SGVpZ2h0O1xuICAgICAgcmV0dXJuIGA8aW5wdXQgY2xhc3M9XCJzZXR0aW5nLWlubGluZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke3ZhbH1cIiBwbGFjZWhvbGRlcj1cImF1dG9cIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ2xvc3BlY1NsdWcnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmxvc3BlY1NsdWcgPz8gJyc7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0IHNldHRpbmctaW5saW5lLWlucHV0LXdpZGVcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHZhbCl9XCIgcGxhY2Vob2xkZXI9XCJlLmcuIHBpY28tOFwiIGRhdGEta2V5PVwiJHtrZXl9XCI+YDtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydEVkaXRpbmcoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgLy8gQm9vbGVhbnMgdG9nZ2xlIGltbWVkaWF0ZWx5XG4gIGlmIChCT09MRUFOX1NFVFRJTkdTLmluY2x1ZGVzKGtleSkpIHtcbiAgICBhZGp1c3RTZXR0aW5nKGtleSwgMSk7XG4gICAgcmVuZGVyU2V0dGluZ3MoKTtcbiAgICBhdXRvUHJvY2VzcygpO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBTZWxlY3RzIGFyZSBhbHdheXMgdmlzaWJsZVxuICBpZiAoU0VMRUNUX1NFVFRJTkdTLmluY2x1ZGVzKGtleSkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRmlsZSBzZXR0aW5ncyBvcGVuIGEgZmlsZSBkaWFsb2dcbiAgaWYgKEZJTEVfU0VUVElOR1MuaW5jbHVkZXMoa2V5KSkge1xuICAgIGlmIChrZXkgPT09ICdwYWxldHRlRmlsZScpIHtcbiAgICAgIGxvYWRQYWxldHRlRmlsZURpYWxvZygpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRm9yIGlubGluZSBpbnB1dHMsIGp1c3QgZm9jdXMgdGhlIGlucHV0IGVsZW1lbnRcbiAgaWYgKElOUFVUX1NFVFRJTkdTLmluY2x1ZGVzKGtleSkpIHtcbiAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYC5zZXR0aW5nLWlubGluZS1pbnB1dFtkYXRhLWtleT1cIiR7a2V5fVwiXWApIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIGlmIChpbnB1dCkge1xuICAgICAgaW5wdXQuZm9jdXMoKTtcbiAgICAgIGlucHV0LnNlbGVjdCgpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xlYXJTZXR0aW5nKGtleTogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnZ3JpZFNpemUnOiBjLmdyaWRTaXplID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnZ3JpZFBoYXNlWCc6IGMuZ3JpZFBoYXNlWCA9IG51bGw7IGJyZWFrO1xuICAgIGNhc2UgJ2dyaWRQaGFzZVknOiBjLmdyaWRQaGFzZVkgPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdhYVRocmVzaG9sZCc6IGMuYWFUaHJlc2hvbGQgPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdhdXRvQ29sb3JzJzogYy5hdXRvQ29sb3JzID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnbG9zcGVjU2x1Zyc6XG4gICAgICBjLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgYy5jdXN0b21QYWxldHRlID0gbnVsbDtcbiAgICAgIHN0YXRlLmxvc3BlY1Jlc3VsdCA9IG51bGw7XG4gICAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gbnVsbDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3BhbGV0dGVGaWxlJzpcbiAgICAgIGlmICghYy5sb3NwZWNTbHVnKSB7XG4gICAgICAgIGMuY3VzdG9tUGFsZXR0ZSA9IG51bGw7XG4gICAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYmdDb2xvcic6IGMuYmdDb2xvciA9IG51bGw7IGJyZWFrO1xuICAgIGNhc2UgJ2JvcmRlclRocmVzaG9sZCc6IGMuYm9yZGVyVGhyZXNob2xkID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0U2NhbGUnOiBjLm91dHB1dFNjYWxlID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0V2lkdGgnOiBjLm91dHB1dFdpZHRoID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0SGVpZ2h0JzogYy5vdXRwdXRIZWlnaHQgPSBudWxsOyBicmVhaztcbiAgfVxuICByZW5kZXJTZXR0aW5ncygpO1xuICBhdXRvUHJvY2VzcygpO1xufVxuXG5mdW5jdGlvbiBjb21taXRFZGl0KGtleTogc3RyaW5nLCByYXdWYWx1ZTogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIGNvbnN0IHZhbCA9IHJhd1ZhbHVlLnRyaW0oKTtcblxuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ2dyaWRTaXplJzpcbiAgICAgIGlmICh2YWwgPT09ICcnIHx8IHZhbCA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIGMuZ3JpZFNpemUgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAxKSBjLmdyaWRTaXplID0gbjtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2dyaWRQaGFzZVgnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnYXV0bycpIHtcbiAgICAgICAgYy5ncmlkUGhhc2VYID0gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG4gPSBwYXJzZUludCh2YWwpO1xuICAgICAgICBpZiAoIWlzTmFOKG4pICYmIG4gPj0gMCkgYy5ncmlkUGhhc2VYID0gbjtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2dyaWRQaGFzZVknOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnYXV0bycpIHtcbiAgICAgICAgYy5ncmlkUGhhc2VZID0gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG4gPSBwYXJzZUludCh2YWwpO1xuICAgICAgICBpZiAoIWlzTmFOKG4pICYmIG4gPj0gMCkgYy5ncmlkUGhhc2VZID0gbjtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ21heEdyaWRDYW5kaWRhdGUnOiB7XG4gICAgICBjb25zdCBuID0gcGFyc2VJbnQodmFsKTtcbiAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAyKSBjLm1heEdyaWRDYW5kaWRhdGUgPSBNYXRoLm1pbig2NCwgbik7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnYWFUaHJlc2hvbGQnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnb2ZmJykge1xuICAgICAgICBjLmFhVGhyZXNob2xkID0gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG4gPSBwYXJzZUZsb2F0KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikpIGMuYWFUaHJlc2hvbGQgPSBNYXRoLm1heCgwLjAxLCBNYXRoLm1pbigxLjAsIG4pKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2F1dG9Db2xvcnMnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnb2ZmJykge1xuICAgICAgICBjLmF1dG9Db2xvcnMgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAyKSB7XG4gICAgICAgICAgYy5hdXRvQ29sb3JzID0gTWF0aC5taW4oMjU2LCBuKTtcbiAgICAgICAgICBjLnBhbGV0dGVOYW1lID0gbnVsbDtcbiAgICAgICAgICBjLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgICAgIGMuY3VzdG9tUGFsZXR0ZSA9IG51bGw7XG4gICAgICAgICAgc3RhdGUucGFsZXR0ZUNvbG9ycyA9IG51bGw7XG4gICAgICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYmdDb2xvcic6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdhdXRvJykge1xuICAgICAgICBjLmJnQ29sb3IgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQWNjZXB0IHdpdGggb3Igd2l0aG91dCAjXG4gICAgICAgIGNvbnN0IGhleCA9IHZhbC5zdGFydHNXaXRoKCcjJykgPyB2YWwgOiAnIycgKyB2YWw7XG4gICAgICAgIGlmICgvXiNbMC05QS1GYS1mXXs2fSQvLnRlc3QoaGV4KSkge1xuICAgICAgICAgIGMuYmdDb2xvciA9IGhleC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdib3JkZXJUaHJlc2hvbGQnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnYXV0bycpIHtcbiAgICAgICAgYy5ib3JkZXJUaHJlc2hvbGQgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlRmxvYXQodmFsKTtcbiAgICAgICAgaWYgKCFpc05hTihuKSkgYy5ib3JkZXJUaHJlc2hvbGQgPSBNYXRoLm1heCgwLjAxLCBNYXRoLm1pbigxLjAsIG4pKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2JnVG9sZXJhbmNlJzoge1xuICAgICAgY29uc3QgbiA9IHBhcnNlRmxvYXQodmFsKTtcbiAgICAgIGlmICghaXNOYU4obikpIGMuYmdUb2xlcmFuY2UgPSBNYXRoLm1heCgwLjAxLCBNYXRoLm1pbigwLjUwLCBuKSk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnZG93bnNjYWxlTW9kZSc6XG4gICAgICBpZiAoRE9XTlNDQUxFX01PREVTLmluY2x1ZGVzKHZhbCkpIGMuZG93bnNjYWxlTW9kZSA9IHZhbDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3BhbGV0dGVOYW1lJzpcbiAgICAgIGMucGFsZXR0ZU5hbWUgPSB2YWwgPT09ICcnID8gbnVsbCA6IHZhbDtcbiAgICAgIGlmIChjLnBhbGV0dGVOYW1lICE9PSBudWxsKSB7XG4gICAgICAgIGMuYXV0b0NvbG9ycyA9IG51bGw7XG4gICAgICAgIGMubG9zcGVjU2x1ZyA9IG51bGw7XG4gICAgICAgIGMuY3VzdG9tUGFsZXR0ZSA9IG51bGw7XG4gICAgICAgIHN0YXRlLmxvc3BlY1Jlc3VsdCA9IG51bGw7XG4gICAgICAgIGZldGNoUGFsZXR0ZUNvbG9ycyhjLnBhbGV0dGVOYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnbG9zcGVjU2x1Zyc6XG4gICAgICAvLyBMb3NwZWM6IGNvbW1pdCB0cmlnZ2VycyBhIGZldGNoXG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdub25lJykge1xuICAgICAgICBjLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgICBjLmN1c3RvbVBhbGV0dGUgPSBudWxsO1xuICAgICAgICBzdGF0ZS5sb3NwZWNSZXN1bHQgPSBudWxsO1xuICAgICAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gbnVsbDtcbiAgICAgICAgcmVuZGVyU2V0dGluZ3MoKTtcbiAgICAgICAgYXV0b1Byb2Nlc3MoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZmV0Y2hMb3NwZWModmFsKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlICdvdXRwdXRTY2FsZSc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdvZmYnIHx8IHZhbCA9PT0gJzEnKSB7XG4gICAgICAgIGMub3V0cHV0U2NhbGUgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAyICYmIG4gPD0gMTYpIGMub3V0cHV0U2NhbGUgPSBuO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0V2lkdGgnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnYXV0bycpIHtcbiAgICAgICAgYy5vdXRwdXRXaWR0aCA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuID0gcGFyc2VJbnQodmFsKTtcbiAgICAgICAgaWYgKCFpc05hTihuKSAmJiBuID49IDEpIGMub3V0cHV0V2lkdGggPSBuO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0SGVpZ2h0JzpcbiAgICAgIGlmICh2YWwgPT09ICcnIHx8IHZhbCA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIGMub3V0cHV0SGVpZ2h0ID0gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG4gPSBwYXJzZUludCh2YWwpO1xuICAgICAgICBpZiAoIWlzTmFOKG4pICYmIG4gPj0gMSkgYy5vdXRwdXRIZWlnaHQgPSBuO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gIH1cblxuICByZW5kZXJTZXR0aW5ncygpO1xuICBhdXRvUHJvY2VzcygpO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIERpYWdub3N0aWNzIHJlbmRlcmluZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHJlbmRlckRpYWdub3N0aWNzKCk6IHZvaWQge1xuICBjb25zdCBpbmZvID0gc3RhdGUuaW1hZ2VJbmZvO1xuICBpZiAoIWluZm8pIHtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlhZy1ncmlkLWluZm8nKSEuaW5uZXJIVE1MID1cbiAgICAgICc8ZGl2IGNsYXNzPVwiZGlhZy1pdGVtXCI+PHNwYW4gY2xhc3M9XCJsYWJlbFwiPk5vIGltYWdlIGxvYWRlZDwvc3Bhbj48L2Rpdj4nO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkaWFnLWdyaWQtYmFycycpIS5pbm5lckhUTUwgPSAnJztcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlhZy1pbmZvJykhLmlubmVySFRNTCA9ICcnO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkaWFnLWhpc3RvZ3JhbScpIS5pbm5lckhUTUwgPSAnJztcbiAgICByZXR1cm47XG4gIH1cblxuICBsZXQgZ3JpZEh0bWwgPSAnJztcbiAgZ3JpZEh0bWwgKz0gYDxkaXYgY2xhc3M9XCJkaWFnLWl0ZW1cIj48c3BhbiBjbGFzcz1cImxhYmVsXCI+RGV0ZWN0ZWQgc2l6ZTwvc3Bhbj48c3BhbiBjbGFzcz1cInZhbHVlXCI+JHtpbmZvLmdyaWRTaXplID8/ICdub25lJ308L3NwYW4+PC9kaXY+YDtcbiAgZ3JpZEh0bWwgKz0gYDxkaXYgY2xhc3M9XCJkaWFnLWl0ZW1cIj48c3BhbiBjbGFzcz1cImxhYmVsXCI+Q29uZmlkZW5jZTwvc3Bhbj48c3BhbiBjbGFzcz1cInZhbHVlXCI+JHtpbmZvLmdyaWRDb25maWRlbmNlICE9IG51bGwgPyAoaW5mby5ncmlkQ29uZmlkZW5jZSAqIDEwMCkudG9GaXhlZCgxKSArICclJyA6ICduL2EnfTwvc3Bhbj48L2Rpdj5gO1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlhZy1ncmlkLWluZm8nKSEuaW5uZXJIVE1MID0gZ3JpZEh0bWw7XG5cbiAgbGV0IGJhcnNIdG1sID0gJyc7XG4gIGlmIChpbmZvLmdyaWRTY29yZXMgJiYgaW5mby5ncmlkU2NvcmVzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtYXhTY29yZSA9IE1hdGgubWF4KC4uLmluZm8uZ3JpZFNjb3Jlcy5tYXAocyA9PiBzWzFdKSk7XG4gICAgY29uc3QgYmVzdFNpemUgPSBpbmZvLmdyaWRTaXplO1xuICAgIGZvciAoY29uc3QgW3NpemUsIHNjb3JlXSBvZiBpbmZvLmdyaWRTY29yZXMpIHtcbiAgICAgIGNvbnN0IHBjdCA9IG1heFNjb3JlID4gMCA/IChzY29yZSAvIG1heFNjb3JlICogMTAwKSA6IDA7XG4gICAgICBjb25zdCBiZXN0ID0gc2l6ZSA9PT0gYmVzdFNpemUgPyAnIGJlc3QnIDogJyc7XG4gICAgICBiYXJzSHRtbCArPSBgPGRpdiBjbGFzcz1cImdyaWQtYmFyLXJvd1wiPmA7XG4gICAgICBiYXJzSHRtbCArPSBgPHNwYW4gY2xhc3M9XCJncmlkLWJhci1sYWJlbFwiPiR7c2l6ZX08L3NwYW4+YDtcbiAgICAgIGJhcnNIdG1sICs9IGA8ZGl2IGNsYXNzPVwiZ3JpZC1iYXItdHJhY2tcIj48ZGl2IGNsYXNzPVwiZ3JpZC1iYXItZmlsbCR7YmVzdH1cIiBzdHlsZT1cIndpZHRoOiR7cGN0fSVcIj48L2Rpdj48L2Rpdj5gO1xuICAgICAgYmFyc0h0bWwgKz0gYDxzcGFuIGNsYXNzPVwiZ3JpZC1iYXItdmFsdWVcIj4ke3Njb3JlLnRvRml4ZWQoMyl9PC9zcGFuPmA7XG4gICAgICBiYXJzSHRtbCArPSBgPC9kaXY+YDtcbiAgICB9XG4gIH1cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RpYWctZ3JpZC1iYXJzJykhLmlubmVySFRNTCA9IGJhcnNIdG1sO1xuXG4gIGxldCBpbmZvSHRtbCA9ICcnO1xuICBpbmZvSHRtbCArPSBgPGRpdiBjbGFzcz1cImRpYWctaXRlbVwiPjxzcGFuIGNsYXNzPVwibGFiZWxcIj5EaW1lbnNpb25zPC9zcGFuPjxzcGFuIGNsYXNzPVwidmFsdWVcIj4ke2luZm8ud2lkdGh9IHggJHtpbmZvLmhlaWdodH08L3NwYW4+PC9kaXY+YDtcbiAgaW5mb0h0bWwgKz0gYDxkaXYgY2xhc3M9XCJkaWFnLWl0ZW1cIj48c3BhbiBjbGFzcz1cImxhYmVsXCI+VW5pcXVlIGNvbG9yczwvc3Bhbj48c3BhbiBjbGFzcz1cInZhbHVlXCI+JHtpbmZvLnVuaXF1ZUNvbG9yc308L3NwYW4+PC9kaXY+YDtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RpYWctaW5mbycpIS5pbm5lckhUTUwgPSBpbmZvSHRtbDtcblxuICBsZXQgaGlzdEh0bWwgPSAnJztcbiAgaWYgKGluZm8uaGlzdG9ncmFtKSB7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBpbmZvLmhpc3RvZ3JhbSkge1xuICAgICAgaGlzdEh0bWwgKz0gYDxkaXYgY2xhc3M9XCJjb2xvci1yb3dcIj5gO1xuICAgICAgaGlzdEh0bWwgKz0gYDxkaXYgY2xhc3M9XCJjb2xvci1zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQ6JHtlbnRyeS5oZXh9XCI+PC9kaXY+YDtcbiAgICAgIGhpc3RIdG1sICs9IGA8c3BhbiBjbGFzcz1cImNvbG9yLWhleFwiPiR7ZW50cnkuaGV4fTwvc3Bhbj5gO1xuICAgICAgaGlzdEh0bWwgKz0gYDxkaXYgY2xhc3M9XCJjb2xvci1iYXItdHJhY2tcIj48ZGl2IGNsYXNzPVwiY29sb3ItYmFyLWZpbGxcIiBzdHlsZT1cIndpZHRoOiR7TWF0aC5taW4oZW50cnkucGVyY2VudCwgMTAwKX0lO2JhY2tncm91bmQ6JHtlbnRyeS5oZXh9XCI+PC9kaXY+PC9kaXY+YDtcbiAgICAgIGhpc3RIdG1sICs9IGA8c3BhbiBjbGFzcz1cImNvbG9yLXBlcmNlbnRcIj4ke2VudHJ5LnBlcmNlbnQudG9GaXhlZCgxKX0lPC9zcGFuPmA7XG4gICAgICBoaXN0SHRtbCArPSBgPC9kaXY+YDtcbiAgICB9XG4gIH1cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RpYWctaGlzdG9ncmFtJykhLmlubmVySFRNTCA9IGhpc3RIdG1sO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEltYWdlIGxvYWRpbmcgYW5kIHByb2Nlc3Npbmdcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkSW1hZ2VCbG9iKHdoaWNoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBieXRlcyA9IGF3YWl0IGludm9rZTxudW1iZXJbXT4oJ2dldF9pbWFnZScsIHsgd2hpY2ggfSk7XG4gIGNvbnN0IGFyciA9IG5ldyBVaW50OEFycmF5KGJ5dGVzKTtcbiAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFthcnJdLCB7IHR5cGU6ICdpbWFnZS9wbmcnIH0pO1xuICByZXR1cm4gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gb3BlbkltYWdlKHBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBzZXRTdGF0dXMoJ0xvYWRpbmcgaW1hZ2UuLi4nLCAncHJvY2Vzc2luZycpO1xuICAvLyBTaG93IHByb21pbmVudCBsb2FkaW5nIG9uIHRoZSB3ZWxjb21lIHNjcmVlbiBpZiBpdCdzIHZpc2libGVcbiAgY29uc3Qgd2FzT25XZWxjb21lID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3dlbGNvbWUnKSEuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuICBpZiAod2FzT25XZWxjb21lKSB7XG4gICAgc2hvd1dlbGNvbWVMb2FkaW5nKCk7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gYXdhaXQgaW52b2tlPEltYWdlSW5mbz4oJ29wZW5faW1hZ2UnLCB7IHBhdGggfSk7XG4gICAgc3RhdGUuaW1hZ2VMb2FkZWQgPSB0cnVlO1xuICAgIHN0YXRlLmltYWdlUGF0aCA9IHBhdGg7XG4gICAgc3RhdGUuaW1hZ2VJbmZvID0gaW5mbztcbiAgICBzdGF0ZS5jb25maWcgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KERFRkFVTFRfQ09ORklHKSk7XG4gICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICBzdGF0ZS5sb3NwZWNFcnJvciA9IG51bGw7XG4gICAgc3RhdGUucGFsZXR0ZUNvbG9ycyA9IG51bGw7XG5cbiAgICBjb25zdCBmbmFtZSA9IHBhdGguc3BsaXQoJy8nKS5wb3AoKSEuc3BsaXQoJ1xcXFwnKS5wb3AoKSE7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbGVuYW1lJykhLnRleHRDb250ZW50ID0gZm5hbWU7XG5cbiAgICBoaWRlV2VsY29tZUxvYWRpbmcoKTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnd2VsY29tZScpIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvcmlnaW5hbC1wYW5lJykhLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Byb2Nlc3NlZC1wYW5lJykhLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cbiAgICBjb25zdCBbb3JpZ1VybCwgcHJvY1VybF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBsb2FkSW1hZ2VCbG9iKCdvcmlnaW5hbCcpLFxuICAgICAgbG9hZEltYWdlQmxvYigncHJvY2Vzc2VkJyksXG4gICAgXSk7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvcmlnaW5hbC1pbWcnKSBhcyBIVE1MSW1hZ2VFbGVtZW50KS5zcmMgPSBvcmlnVXJsO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHJvY2Vzc2VkLWltZycpIGFzIEhUTUxJbWFnZUVsZW1lbnQpLnNyYyA9IHByb2NVcmw7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29yaWdpbmFsLWRpbXMnKSEudGV4dENvbnRlbnQgPSBgJHtpbmZvLndpZHRofVxcdTAwZDcke2luZm8uaGVpZ2h0fWA7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Byb2Nlc3NlZC1kaW1zJykhLnRleHRDb250ZW50ID0gYCR7aW5mby53aWR0aH1cXHUwMGQ3JHtpbmZvLmhlaWdodH1gO1xuXG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5ncy1wcmV2aWV3LWltZycpIGFzIEhUTUxJbWFnZUVsZW1lbnQpLnNyYyA9IHByb2NVcmw7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmdzLXByZXZpZXctaW1nJykhLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5ncy1uby1pbWFnZScpIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgcmVuZGVyU2V0dGluZ3MoKTtcbiAgICByZW5kZXJEaWFnbm9zdGljcygpO1xuICAgIHNldFN0YXR1cyhgTG9hZGVkIFxcdTIwMTQgJHtpbmZvLndpZHRofVxcdTAwZDcke2luZm8uaGVpZ2h0fSwgZ3JpZD0ke2luZm8uZ3JpZFNpemUgPz8gJ25vbmUnfSwgJHtpbmZvLnVuaXF1ZUNvbG9yc30gY29sb3JzYCwgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhpZGVXZWxjb21lTG9hZGluZygpO1xuICAgIHNldFN0YXR1cygnRXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZFByb2Nlc3NDb25maWcoKTogUHJvY2Vzc0NvbmZpZyB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHJldHVybiB7XG4gICAgZ3JpZFNpemU6IGMuZ3JpZFNpemUsXG4gICAgZ3JpZFBoYXNlWDogYy5ncmlkUGhhc2VYLFxuICAgIGdyaWRQaGFzZVk6IGMuZ3JpZFBoYXNlWSxcbiAgICBtYXhHcmlkQ2FuZGlkYXRlOiBjLm1heEdyaWRDYW5kaWRhdGUgPT09IDMyID8gbnVsbCA6IGMubWF4R3JpZENhbmRpZGF0ZSxcbiAgICBub0dyaWREZXRlY3Q6IGMubm9HcmlkRGV0ZWN0LFxuICAgIGRvd25zY2FsZU1vZGU6IGMuZG93bnNjYWxlTW9kZSxcbiAgICBhYVRocmVzaG9sZDogYy5hYVRocmVzaG9sZCxcbiAgICBwYWxldHRlTmFtZTogYy5wYWxldHRlTmFtZSxcbiAgICBhdXRvQ29sb3JzOiBjLmF1dG9Db2xvcnMsXG4gICAgY3VzdG9tUGFsZXR0ZTogYy5jdXN0b21QYWxldHRlLFxuICAgIG5vUXVhbnRpemU6IGMubm9RdWFudGl6ZSxcbiAgICByZW1vdmVCZzogYy5yZW1vdmVCZyxcbiAgICBiZ0NvbG9yOiBjLmJnQ29sb3IsXG4gICAgYm9yZGVyVGhyZXNob2xkOiBjLmJvcmRlclRocmVzaG9sZCxcbiAgICBiZ1RvbGVyYW5jZTogYy5iZ1RvbGVyYW5jZSxcbiAgICBmbG9vZEZpbGw6IGMuZmxvb2RGaWxsLFxuICAgIG91dHB1dFNjYWxlOiBjLm91dHB1dFNjYWxlLFxuICAgIG91dHB1dFdpZHRoOiBjLm91dHB1dFdpZHRoLFxuICAgIG91dHB1dEhlaWdodDogYy5vdXRwdXRIZWlnaHQsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NJbWFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFzdGF0ZS5pbWFnZUxvYWRlZCB8fCBzdGF0ZS5wcm9jZXNzaW5nKSByZXR1cm47XG4gIHN0YXRlLnByb2Nlc3NpbmcgPSB0cnVlO1xuICBzZXRTdGF0dXMoJ1Byb2Nlc3NpbmcuLi4nLCAncHJvY2Vzc2luZycpO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZTxQcm9jZXNzUmVzdWx0PigncHJvY2VzcycsIHsgcGM6IGJ1aWxkUHJvY2Vzc0NvbmZpZygpIH0pO1xuICAgIHN0YXRlLmltYWdlSW5mbyA9IHsgLi4uc3RhdGUuaW1hZ2VJbmZvISwgLi4ucmVzdWx0IH07XG5cbiAgICBjb25zdCBwcm9jVXJsID0gYXdhaXQgbG9hZEltYWdlQmxvYigncHJvY2Vzc2VkJyk7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwcm9jZXNzZWQtaW1nJykgYXMgSFRNTEltYWdlRWxlbWVudCkuc3JjID0gcHJvY1VybDtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHJvY2Vzc2VkLWRpbXMnKSEudGV4dENvbnRlbnQgPSBgJHtyZXN1bHQud2lkdGh9XFx1MDBkNyR7cmVzdWx0LmhlaWdodH1gO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtcHJldmlldy1pbWcnKSBhcyBIVE1MSW1hZ2VFbGVtZW50KS5zcmMgPSBwcm9jVXJsO1xuXG4gICAgcmVuZGVyRGlhZ25vc3RpY3MoKTtcbiAgICBjb25zdCBlbGFwc2VkID0gKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAvIDEwMDApLnRvRml4ZWQoMik7XG4gICAgc3RhdGUubGFzdFByb2Nlc3NUaW1lID0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgICBzZXRTdGF0dXMoYFByb2Nlc3NlZCBcXHUyMDE0ICR7cmVzdWx0LndpZHRofVxcdTAwZDcke3Jlc3VsdC5oZWlnaHR9LCAke3Jlc3VsdC51bmlxdWVDb2xvcnN9IGNvbG9ycyAoJHtlbGFwc2VkfXMpYCwgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnRXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzdGF0ZS5wcm9jZXNzaW5nID0gZmFsc2U7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBGaWxlIGRpYWxvZ3Ncbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5hc3luYyBmdW5jdGlvbiBkb09wZW4oKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlbkRpYWxvZyh7XG4gICAgICBtdWx0aXBsZTogZmFsc2UsXG4gICAgICBmaWx0ZXJzOiBbe1xuICAgICAgICBuYW1lOiAnSW1hZ2VzJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydwbmcnLCAnanBnJywgJ2pwZWcnLCAnZ2lmJywgJ3dlYnAnLCAnYm1wJ10sXG4gICAgICB9XSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBhd2FpdCBvcGVuSW1hZ2UocmVzdWx0KTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yOiAnICsgZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9TYXZlKCk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIXN0YXRlLmltYWdlTG9hZGVkKSByZXR1cm47XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2F2ZURpYWxvZyh7XG4gICAgICBkZWZhdWx0UGF0aDogc3RhdGUuaW1hZ2VQYXRoID8gc3RhdGUuaW1hZ2VQYXRoLnJlcGxhY2UoL1xcLlteLl0rJC8sICdfZml4ZWQucG5nJykgOiAnb3V0cHV0LnBuZycsXG4gICAgICBmaWx0ZXJzOiBbe1xuICAgICAgICBuYW1lOiAnUE5HIEltYWdlJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydwbmcnXSxcbiAgICAgIH1dLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQpIHtcbiAgICAgIGF3YWl0IGludm9rZSgnc2F2ZV9pbWFnZScsIHsgcGF0aDogcmVzdWx0IH0pO1xuICAgICAgc2V0U3RhdHVzKCdTYXZlZDogJyArIHJlc3VsdC5zcGxpdCgnLycpLnBvcCgpIS5zcGxpdCgnXFxcXCcpLnBvcCgpISwgJ3N1Y2Nlc3MnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yOiAnICsgZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBLZXlib2FyZCBoYW5kbGluZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAvLyBXaGVuIGZvY3VzZWQgb24gYW4gYWx3YXlzLXZpc2libGUgaW5saW5lIGlucHV0LCBoYW5kbGUgRW50ZXIvRXNjYXBlL1RhYlxuICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdzZXR0aW5nLWlubGluZS1pbnB1dCcpKSB7XG4gICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgY29tbWl0RWRpdCh0YXJnZXQuZGF0YXNldC5rZXkhLCB0YXJnZXQudmFsdWUpO1xuICAgICAgdGFyZ2V0LmJsdXIoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnRXNjYXBlJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmJsdXIoKTtcbiAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ1RhYicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5ibHVyKCk7XG4gICAgICBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gV2hlbiBmb2N1c2VkIG9uIGFuIGlubGluZSBzZWxlY3QsIGxldCBpdCBoYW5kbGUgaXRzIG93biBrZXlzIGV4Y2VwdCBUYWJcbiAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0Py5jb250YWlucygnc2V0dGluZy1pbmxpbmUtc2VsZWN0JykpIHtcbiAgICBpZiAoZS5rZXkgPT09ICdUYWInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gSWdub3JlIG90aGVyIHR5cGluZyBpbiBpbnB1dHMgKHNoZWV0IGlucHV0cywgZXRjLilcbiAgY29uc3QgdGFnID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lO1xuICBpZiAodGFnID09PSAnSU5QVVQnIHx8IHRhZyA9PT0gJ1RFWFRBUkVBJykge1xuICAgIC8vIFN0aWxsIGFsbG93IFRhYiB0byBzd2l0Y2ggdGFicyBmcm9tIGFueSBpbnB1dFxuICAgIGlmIChlLmtleSA9PT0gJ1RhYicpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTsgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGtleSA9IGUua2V5O1xuXG4gIC8vIFRhYiBzd2l0Y2hpbmdcbiAgaWYgKGtleSA9PT0gJ1RhYicpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTsgcmV0dXJuOyB9XG5cbiAgLy8gR2xvYmFsIHNob3J0Y3V0c1xuICBpZiAoa2V5ID09PSAnbycpIHsgZG9PcGVuKCk7IHJldHVybjsgfVxuICBpZiAoa2V5ID09PSAncycpIHsgZG9TYXZlKCk7IHJldHVybjsgfVxuICBpZiAoa2V5ID09PSAnICcpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBwcm9jZXNzSW1hZ2UoKTsgcmV0dXJuOyB9XG4gIGlmIChrZXkgPT09ICdyJykgeyByZXNldENvbmZpZygpOyByZXR1cm47IH1cbiAgaWYgKChlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSAmJiBrZXkgPT09ICdxJykgeyB3aW5kb3cuY2xvc2UoKTsgcmV0dXJuOyB9XG5cbiAgLy8gU2V0dGluZ3MgbmF2aWdhdGlvbiAob25seSBvbiBzZXR0aW5ncyB0YWIsIGJsb2NrZWQgZHVyaW5nIHByb2Nlc3NpbmcpXG4gIGlmIChzdGF0ZS5hY3RpdmVUYWIgPT09ICdzZXR0aW5ncycgJiYgIXN0YXRlLnByb2Nlc3NpbmcpIHtcbiAgICBjb25zdCByb3dzID0gZ2V0U2V0dGluZ1Jvd3MoKTtcbiAgICBpZiAoa2V5ID09PSAnaicgfHwga2V5ID09PSAnQXJyb3dEb3duJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ID0gTWF0aC5taW4oc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ICsgMSwgcm93cy5sZW5ndGggLSAxKTtcbiAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdrJyB8fCBrZXkgPT09ICdBcnJvd1VwJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ID0gTWF0aC5tYXgoc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4IC0gMSwgMCk7XG4gICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoa2V5ID09PSAnRW50ZXInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCByb3cgPSByb3dzW3N0YXRlLnNldHRpbmdzRm9jdXNJbmRleF07XG4gICAgICBpZiAocm93KSBzdGFydEVkaXRpbmcocm93LmtleSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBzd2l0Y2hUYWIoJ3ByZXZpZXcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGtleSA9PT0gJ2wnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCByb3cgPSByb3dzW3N0YXRlLnNldHRpbmdzRm9jdXNJbmRleF07XG4gICAgICBpZiAocm93KSB7XG4gICAgICAgIGFkanVzdFNldHRpbmcocm93LmtleSwgMSk7XG4gICAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgICAgIGF1dG9Qcm9jZXNzKCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdoJyB8fCBrZXkgPT09ICdBcnJvd0xlZnQnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCByb3cgPSByb3dzW3N0YXRlLnNldHRpbmdzRm9jdXNJbmRleF07XG4gICAgICBpZiAocm93KSB7XG4gICAgICAgIGFkanVzdFNldHRpbmcocm93LmtleSwgLTEpO1xuICAgICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgICBhdXRvUHJvY2VzcygpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxufSk7XG5cbmNvbnN0IFRBQlMgPSBbJ3ByZXZpZXcnLCAnc2V0dGluZ3MnLCAnZGlhZ25vc3RpY3MnLCAnYmF0Y2gnLCAnc2hlZXQnXTtcblxuZnVuY3Rpb24gY3ljbGVUYWIoZGlyOiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IGlkeCA9IFRBQlMuaW5kZXhPZihzdGF0ZS5hY3RpdmVUYWIpO1xuICBpZHggPSAoaWR4ICsgZGlyICsgVEFCUy5sZW5ndGgpICUgVEFCUy5sZW5ndGg7XG4gIHN3aXRjaFRhYihUQUJTW2lkeF0pO1xufVxuXG5mdW5jdGlvbiByZXNldENvbmZpZygpOiB2b2lkIHtcbiAgc3RhdGUuY29uZmlnID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX0NPTkZJRykpO1xuICBzdGF0ZS5sb3NwZWNSZXN1bHQgPSBudWxsO1xuICBzdGF0ZS5sb3NwZWNFcnJvciA9IG51bGw7XG4gIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICByZW5kZXJTZXR0aW5ncygpO1xuICBpZiAoc3RhdGUuaW1hZ2VMb2FkZWQpIHtcbiAgICBhdXRvUHJvY2VzcygpO1xuICB9XG4gIHNldFN0YXR1cygnQ29uZmlnIHJlc2V0IHRvIGRlZmF1bHRzJyk7XG59XG5cbi8vIEF1dG8tcHJvY2VzcyB3aXRoIGRlYm91bmNlXG5sZXQgcHJvY2Vzc1RpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gYXV0b1Byb2Nlc3MoKTogdm9pZCB7XG4gIGlmICghc3RhdGUuaW1hZ2VMb2FkZWQpIHJldHVybjtcbiAgaWYgKHByb2Nlc3NUaW1lcikgY2xlYXJUaW1lb3V0KHByb2Nlc3NUaW1lcik7XG4gIHByb2Nlc3NUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcHJvY2Vzc0ltYWdlKCksIDE1MCk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQmF0Y2ggdGFiXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gcmVuZGVyQmF0Y2goKTogdm9pZCB7XG4gIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JhdGNoLWNvbnRlbnQnKSE7XG4gIGxldCBodG1sID0gJyc7XG5cbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLXNlY3Rpb25cIj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtdGl0bGVcIj5CYXRjaCBQcm9jZXNzaW5nPC9kaXY+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLWRlc2NcIj5Qcm9jZXNzIG11bHRpcGxlIGltYWdlcyB3aXRoIHRoZSBjdXJyZW50IHBpcGVsaW5lIHNldHRpbmdzLjwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gRmlsZSBsaXN0XG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJiYXRjaC1zZWN0aW9uXCI+JztcbiAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImJhdGNoLXJvd1wiPjxzcGFuIGNsYXNzPVwiYmF0Y2gtbGFiZWxcIj5GaWxlczwvc3Bhbj48c3BhbiBjbGFzcz1cImJhdGNoLXZhbHVlXCI+JHtzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aH0gc2VsZWN0ZWQ8L3NwYW4+YDtcbiAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cImJhdGNoLWJ0blwiIGlkPVwiYmF0Y2gtYWRkLWZpbGVzXCIke3N0YXRlLmJhdGNoUnVubmluZyA/ICcgZGlzYWJsZWQnIDogJyd9PkFkZCBGaWxlczwvYnV0dG9uPmA7XG4gIGlmIChzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1kaW1cIiBpZD1cImJhdGNoLWNsZWFyLWZpbGVzXCIke3N0YXRlLmJhdGNoUnVubmluZyA/ICcgZGlzYWJsZWQnIDogJyd9PkNsZWFyPC9idXR0b24+YDtcbiAgfVxuICBodG1sICs9ICc8L2Rpdj4nO1xuXG4gIGlmIChzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtZmlsZS1saXN0XCI+JztcbiAgICBmb3IgKGNvbnN0IGYgb2Ygc3RhdGUuYmF0Y2hGaWxlcykge1xuICAgICAgY29uc3QgbmFtZSA9IGYuc3BsaXQoJy8nKS5wb3AoKSEuc3BsaXQoJ1xcXFwnKS5wb3AoKSE7XG4gICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYmF0Y2gtZmlsZVwiPiR7ZXNjYXBlSHRtbChuYW1lKX08L2Rpdj5gO1xuICAgIH1cbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICB9XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gT3V0cHV0IGRpcmVjdG9yeVxuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtc2VjdGlvblwiPic7XG4gIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJiYXRjaC1yb3dcIj48c3BhbiBjbGFzcz1cImJhdGNoLWxhYmVsXCI+T3V0cHV0PC9zcGFuPjxzcGFuIGNsYXNzPVwiYmF0Y2gtdmFsdWVcIj4ke3N0YXRlLmJhdGNoT3V0cHV0RGlyID8gZXNjYXBlSHRtbChzdGF0ZS5iYXRjaE91dHB1dERpci5zcGxpdCgnLycpLnBvcCgpIS5zcGxpdCgnXFxcXCcpLnBvcCgpISkgOiAnbm90IHNldCd9PC9zcGFuPmA7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJiYXRjaC1idG5cIiBpZD1cImJhdGNoLWNob29zZS1kaXJcIiR7c3RhdGUuYmF0Y2hSdW5uaW5nID8gJyBkaXNhYmxlZCcgOiAnJ30+Q2hvb3NlIEZvbGRlcjwvYnV0dG9uPmA7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gUnVuIGJ1dHRvblxuICBjb25zdCBjYW5SdW4gPSBzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA+IDAgJiYgc3RhdGUuYmF0Y2hPdXRwdXREaXIgJiYgIXN0YXRlLmJhdGNoUnVubmluZztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLXNlY3Rpb25cIj4nO1xuICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1wcmltYXJ5XCIgaWQ9XCJiYXRjaC1ydW5cIiR7Y2FuUnVuID8gJycgOiAnIGRpc2FibGVkJ30+UHJvY2VzcyBBbGw8L2J1dHRvbj5gO1xuICBodG1sICs9ICc8L2Rpdj4nO1xuXG4gIC8vIFByb2dyZXNzXG4gIGlmIChzdGF0ZS5iYXRjaFByb2dyZXNzKSB7XG4gICAgY29uc3QgcGN0ID0gTWF0aC5yb3VuZCgoc3RhdGUuYmF0Y2hQcm9ncmVzcy5jdXJyZW50IC8gc3RhdGUuYmF0Y2hQcm9ncmVzcy50b3RhbCkgKiAxMDApO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJiYXRjaC1zZWN0aW9uXCI+JztcbiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYmF0Y2gtcHJvZ3Jlc3MtaW5mb1wiPiR7c3RhdGUuYmF0Y2hQcm9ncmVzcy5jdXJyZW50fS8ke3N0YXRlLmJhdGNoUHJvZ3Jlc3MudG90YWx9ICZtZGFzaDsgJHtlc2NhcGVIdG1sKHN0YXRlLmJhdGNoUHJvZ3Jlc3MuZmlsZW5hbWUpfTwvZGl2PmA7XG4gICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImJhdGNoLXByb2dyZXNzLWJhclwiPjxkaXYgY2xhc3M9XCJiYXRjaC1wcm9ncmVzcy1maWxsXCIgc3R5bGU9XCJ3aWR0aDoke3BjdH0lXCI+PC9kaXY+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICB9XG5cbiAgLy8gUmVzdWx0c1xuICBpZiAoc3RhdGUuYmF0Y2hSZXN1bHQpIHtcbiAgICBjb25zdCByID0gc3RhdGUuYmF0Y2hSZXN1bHQ7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLXNlY3Rpb25cIj4nO1xuICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJiYXRjaC1yZXN1bHQtc3VtbWFyeVwiPiR7ci5zdWNjZWVkZWR9IHN1Y2NlZWRlZGA7XG4gICAgaWYgKHIuZmFpbGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGh0bWwgKz0gYCwgPHNwYW4gY2xhc3M9XCJiYXRjaC1yZXN1bHQtZmFpbGVkXCI+JHtyLmZhaWxlZC5sZW5ndGh9IGZhaWxlZDwvc3Bhbj5gO1xuICAgIH1cbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICAgIGlmIChyLmZhaWxlZC5sZW5ndGggPiAwKSB7XG4gICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtZXJyb3JzXCI+JztcbiAgICAgIGZvciAoY29uc3QgZiBvZiByLmZhaWxlZCkge1xuICAgICAgICBjb25zdCBuYW1lID0gZi5wYXRoLnNwbGl0KCcvJykucG9wKCkhLnNwbGl0KCdcXFxcJykucG9wKCkhO1xuICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYmF0Y2gtZXJyb3JcIj4ke2VzY2FwZUh0bWwobmFtZSl9OiAke2VzY2FwZUh0bWwoZi5lcnJvcil9PC9kaXY+YDtcbiAgICAgIH1cbiAgICAgIGh0bWwgKz0gJzwvZGl2Pic7XG4gICAgfVxuICAgIGh0bWwgKz0gJzwvZGl2Pic7XG4gIH1cblxuICBlbC5pbm5lckhUTUwgPSBodG1sO1xufVxuXG5hc3luYyBmdW5jdGlvbiBiYXRjaEFkZEZpbGVzKCk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wZW5EaWFsb2coe1xuICAgICAgbXVsdGlwbGU6IHRydWUsXG4gICAgICBmaWx0ZXJzOiBbe1xuICAgICAgICBuYW1lOiAnSW1hZ2VzJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydwbmcnLCAnanBnJywgJ2pwZWcnLCAnZ2lmJywgJ3dlYnAnLCAnYm1wJ10sXG4gICAgICB9XSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAvLyByZXN1bHQgbWF5IGJlIGEgc3RyaW5nIG9yIGFycmF5IGRlcGVuZGluZyBvbiBzZWxlY3Rpb25cbiAgICAgIGNvbnN0IHBhdGhzID0gQXJyYXkuaXNBcnJheShyZXN1bHQpID8gcmVzdWx0IDogW3Jlc3VsdF07XG4gICAgICAvLyBBZGQgdG8gZXhpc3RpbmcgbGlzdCwgZGVkdXBcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gbmV3IFNldChzdGF0ZS5iYXRjaEZpbGVzKTtcbiAgICAgIGZvciAoY29uc3QgcCBvZiBwYXRocykge1xuICAgICAgICBpZiAocCAmJiAhZXhpc3RpbmcuaGFzKHApKSB7XG4gICAgICAgICAgc3RhdGUuYmF0Y2hGaWxlcy5wdXNoKHApO1xuICAgICAgICAgIGV4aXN0aW5nLmFkZChwKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmVuZGVyQmF0Y2goKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yOiAnICsgZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYmF0Y2hDaG9vc2VEaXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlbkRpYWxvZyh7XG4gICAgICBkaXJlY3Rvcnk6IHRydWUsXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgc3RhdGUuYmF0Y2hPdXRwdXREaXIgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XG4gICAgICByZW5kZXJCYXRjaCgpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnRXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBiYXRjaFJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKHN0YXRlLmJhdGNoUnVubmluZyB8fCBzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA9PT0gMCB8fCAhc3RhdGUuYmF0Y2hPdXRwdXREaXIpIHJldHVybjtcbiAgc3RhdGUuYmF0Y2hSdW5uaW5nID0gdHJ1ZTtcbiAgc3RhdGUuYmF0Y2hSZXN1bHQgPSBudWxsO1xuICBzdGF0ZS5iYXRjaFByb2dyZXNzID0geyBjdXJyZW50OiAwLCB0b3RhbDogc3RhdGUuYmF0Y2hGaWxlcy5sZW5ndGgsIGZpbGVuYW1lOiAnJyB9O1xuICByZW5kZXJCYXRjaCgpO1xuICBzZXRTdGF0dXMoJ0JhdGNoIHByb2Nlc3NpbmcuLi4nLCAncHJvY2Vzc2luZycpO1xuXG4gIC8vIExpc3RlbiBmb3IgcHJvZ3Jlc3MgZXZlbnRzXG4gIGNvbnN0IHVubGlzdGVuID0gYXdhaXQgd2luZG93Ll9fVEFVUklfXy5ldmVudC5saXN0ZW4oJ2JhdGNoLXByb2dyZXNzJywgKGV2ZW50OiB7IHBheWxvYWQ6IHsgY3VycmVudDogbnVtYmVyOyB0b3RhbDogbnVtYmVyOyBmaWxlbmFtZTogc3RyaW5nIH0gfSkgPT4ge1xuICAgIHN0YXRlLmJhdGNoUHJvZ3Jlc3MgPSBldmVudC5wYXlsb2FkO1xuICAgIHJlbmRlckJhdGNoKCk7XG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlPHsgc3VjY2VlZGVkOiBudW1iZXI7IGZhaWxlZDogeyBwYXRoOiBzdHJpbmc7IGVycm9yOiBzdHJpbmcgfVtdIH0+KCdiYXRjaF9wcm9jZXNzJywge1xuICAgICAgaW5wdXRQYXRoczogc3RhdGUuYmF0Y2hGaWxlcyxcbiAgICAgIG91dHB1dERpcjogc3RhdGUuYmF0Y2hPdXRwdXREaXIsXG4gICAgICBwYzogYnVpbGRQcm9jZXNzQ29uZmlnKCksXG4gICAgICBvdmVyd3JpdGU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHN0YXRlLmJhdGNoUmVzdWx0ID0gcmVzdWx0O1xuICAgIHNldFN0YXR1cyhgQmF0Y2ggZG9uZTogJHtyZXN1bHQuc3VjY2VlZGVkfSBzdWNjZWVkZWQsICR7cmVzdWx0LmZhaWxlZC5sZW5ndGh9IGZhaWxlZGAsIHJlc3VsdC5mYWlsZWQubGVuZ3RoID4gMCA/ICdlcnJvcicgOiAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc2V0U3RhdHVzKCdCYXRjaCBlcnJvcjogJyArIGUsICdlcnJvcicpO1xuICB9IGZpbmFsbHkge1xuICAgIHN0YXRlLmJhdGNoUnVubmluZyA9IGZhbHNlO1xuICAgIHN0YXRlLmJhdGNoUHJvZ3Jlc3MgPSBudWxsO1xuICAgIGlmICh0eXBlb2YgdW5saXN0ZW4gPT09ICdmdW5jdGlvbicpIHVubGlzdGVuKCk7XG4gICAgcmVuZGVyQmF0Y2goKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNoZWV0IHRhYlxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHJlbmRlclNoZWV0KCk6IHZvaWQge1xuICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC1jb250ZW50JykhO1xuICBjb25zdCBzYyA9IHN0YXRlLnNoZWV0Q29uZmlnO1xuICBjb25zdCBkaXMgPSBzdGF0ZS5zaGVldFByb2Nlc3NpbmcgPyAnIGRpc2FibGVkJyA6ICcnO1xuICBsZXQgaHRtbCA9ICcnO1xuXG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXRpdGxlXCI+U3ByaXRlIFNoZWV0IFByb2Nlc3Npbmc8L2Rpdj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtZGVzY1wiPlNwbGl0IGEgc3ByaXRlIHNoZWV0IGludG8gaW5kaXZpZHVhbCB0aWxlcywgcnVuIHRoZSBub3JtYWxpemUgcGlwZWxpbmUgb24gZWFjaCBvbmUsIHRoZW4gcmVhc3NlbWJsZSBpbnRvIGEgY2xlYW4gc2hlZXQuIFlvdSBjYW4gYWxzbyBleHBvcnQgZWFjaCB0aWxlIGFzIGEgc2VwYXJhdGUgZmlsZSBvciBnZW5lcmF0ZSBhbiBhbmltYXRlZCBHSUYuPC9kaXY+JztcbiAgaWYgKCFzdGF0ZS5pbWFnZUxvYWRlZCkge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1kZXNjXCIgc3R5bGU9XCJjb2xvcjp2YXIoLS15ZWxsb3cpO21hcmdpbi10b3A6NnB4XCI+TG9hZCBhbiBpbWFnZSBmaXJzdCBpbiB0aGUgUHJldmlldyB0YWIuPC9kaXY+JztcbiAgfVxuICBodG1sICs9ICc8L2Rpdj4nO1xuXG4gIC8vIE1vZGUgdG9nZ2xlXG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206NHB4XCI+U3BsaXQgTW9kZTwvZGl2Pic7XG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1tb2RlLXRvZ2dsZVwiPic7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJzaGVldC1tb2RlLWJ0biR7c3RhdGUuc2hlZXRNb2RlID09PSAnZml4ZWQnID8gJyBhY3RpdmUnIDogJyd9XCIgZGF0YS1tb2RlPVwiZml4ZWRcIj5GaXhlZCBHcmlkPC9idXR0b24+YDtcbiAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cInNoZWV0LW1vZGUtYnRuJHtzdGF0ZS5zaGVldE1vZGUgPT09ICdhdXRvJyA/ICcgYWN0aXZlJyA6ICcnfVwiIGRhdGEtbW9kZT1cImF1dG9cIj5BdXRvLVNwbGl0PC9idXR0b24+YDtcbiAgaHRtbCArPSAnPC9kaXY+JztcbiAgaWYgKHN0YXRlLnNoZWV0TW9kZSA9PT0gJ2ZpeGVkJykge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+VXNlIHdoZW4geW91ciBzaGVldCBoYXMgYSB1bmlmb3JtIGdyaWQgJm1kYXNoOyBhbGwgdGlsZXMgYXJlIHRoZSBzYW1lIHNpemUgd2l0aCBjb25zaXN0ZW50IHNwYWNpbmcuPC9kaXY+JztcbiAgfSBlbHNlIHtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPlVzZSB3aGVuIHRpbGVzIGFyZSBkaWZmZXJlbnQgc2l6ZXMgb3IgaXJyZWd1bGFybHkgcGxhY2VkLiBEZXRlY3RzIHNwcml0ZXMgYXV0b21hdGljYWxseSBieSBmaW5kaW5nIHNlcGFyYXRvciByb3dzL2NvbHVtbnMuIDxzdHJvbmc+U3ByaXRlcyBtdXN0IGJlIG9uIGEgcHVyZSB3aGl0ZSBiYWNrZ3JvdW5kLjwvc3Ryb25nPjwvZGl2Pic7XG4gIH1cbiAgaHRtbCArPSAnPC9kaXY+JztcblxuICAvLyBNb2RlLXNwZWNpZmljIHNldHRpbmdzXG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgaWYgKHN0YXRlLnNoZWV0TW9kZSA9PT0gJ2ZpeGVkJykge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+VGlsZSBXaWR0aDwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtdHdcIiB2YWx1ZT1cIiR7c2MudGlsZVdpZHRoID8/ICcnfVwiIHBsYWNlaG9sZGVyPVwicHhcIiR7ZGlzfT48L2Rpdj5gO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+V2lkdGggb2YgZWFjaCB0aWxlIGluIHBpeGVscy4gUmVxdWlyZWQuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+VGlsZSBIZWlnaHQ8L3NwYW4+JztcbiAgICBodG1sICs9IGA8aW5wdXQgY2xhc3M9XCJzaGVldC1pbnB1dFwiIHR5cGU9XCJudW1iZXJcIiBpZD1cInNoZWV0LXRoXCIgdmFsdWU9XCIke3NjLnRpbGVIZWlnaHQgPz8gJyd9XCIgcGxhY2Vob2xkZXI9XCJweFwiJHtkaXN9PjwvZGl2PmA7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5IZWlnaHQgb2YgZWFjaCB0aWxlIGluIHBpeGVscy4gUmVxdWlyZWQuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+U3BhY2luZzwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtc3BcIiB2YWx1ZT1cIiR7c2Muc3BhY2luZ31cIiBwbGFjZWhvbGRlcj1cIjBcIiR7ZGlzfT48L2Rpdj5gO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+R2FwIGJldHdlZW4gdGlsZXMgaW4gcGl4ZWxzLiBTZXQgdG8gMCBpZiB0aWxlcyBhcmUgcGFja2VkIGVkZ2UtdG8tZWRnZS48L2Rpdj4nO1xuXG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5NYXJnaW48L3NwYW4+JztcbiAgICBodG1sICs9IGA8aW5wdXQgY2xhc3M9XCJzaGVldC1pbnB1dFwiIHR5cGU9XCJudW1iZXJcIiBpZD1cInNoZWV0LW1nXCIgdmFsdWU9XCIke3NjLm1hcmdpbn1cIiBwbGFjZWhvbGRlcj1cIjBcIiR7ZGlzfT48L2Rpdj5gO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+Qm9yZGVyIGFyb3VuZCB0aGUgZW50aXJlIHNoZWV0IGluIHBpeGVscy4gVXN1YWxseSAwLjwvZGl2Pic7XG4gIH0gZWxzZSB7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5TZXAuIFRocmVzaG9sZDwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtc2VwXCIgdmFsdWU9XCIke3NjLnNlcGFyYXRvclRocmVzaG9sZH1cIiBzdGVwPVwiMC4wNVwiIG1pbj1cIjBcIiBtYXg9XCIxXCIke2Rpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPkhvdyB1bmlmb3JtIGEgcm93L2NvbHVtbiBtdXN0IGJlIHRvIGNvdW50IGFzIGEgc2VwYXJhdG9yICgwJm5kYXNoOzEpLiBIaWdoZXIgPSBzdHJpY3Rlci4gMC45MCB3b3JrcyBmb3IgbW9zdCBzaGVldHMuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+TWluIFNwcml0ZSBTaXplPC9zcGFuPic7XG4gICAgaHRtbCArPSBgPGlucHV0IGNsYXNzPVwic2hlZXQtaW5wdXRcIiB0eXBlPVwibnVtYmVyXCIgaWQ9XCJzaGVldC1taW5cIiB2YWx1ZT1cIiR7c2MubWluU3ByaXRlU2l6ZX1cIiBtaW49XCIxXCIke2Rpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPklnbm9yZSBkZXRlY3RlZCByZWdpb25zIHNtYWxsZXIgdGhhbiB0aGlzIG1hbnkgcGl4ZWxzLiBGaWx0ZXJzIG91dCBub2lzZSBhbmQgdGlueSBmcmFnbWVudHMuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+UGFkZGluZzwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtcGFkXCIgdmFsdWU9XCIke3NjLnBhZH1cIiBtaW49XCIwXCIke2Rpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPkV4dHJhIHBpeGVscyB0byBpbmNsdWRlIGFyb3VuZCBlYWNoIGRldGVjdGVkIHNwcml0ZS4gVXNlZnVsIGlmIGF1dG8tZGV0ZWN0aW9uIGNyb3BzIHRvbyB0aWdodGx5LjwvZGl2Pic7XG4gIH1cbiAgaHRtbCArPSAnPC9kaXY+JztcblxuICAvLyBTa2lwIG5vcm1hbGl6ZSB0b2dnbGVcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNlY3Rpb25cIj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtc2V0dGluZ1wiPjxzcGFuIGNsYXNzPVwic2hlZXQtc2V0dGluZy1sYWJlbFwiPlNraXAgTm9ybWFsaXplPC9zcGFuPic7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJiYXRjaC1idG4gYmF0Y2gtYnRuLWRpbVwiIGlkPVwic2hlZXQtbm8tbm9ybWFsaXplXCIgc3R5bGU9XCJtaW4td2lkdGg6NDBweFwiJHtkaXN9PiR7c2Mubm9Ob3JtYWxpemUgPyAnb24nIDogJ29mZid9PC9idXR0b24+PC9kaXY+YDtcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5XaGVuIG9uLCB0aWxlcyBhcmUgc3BsaXQgYW5kIHJlYXNzZW1ibGVkIHdpdGhvdXQgcnVubmluZyB0aGUgcGlwZWxpbmUuIFVzZWZ1bCBmb3IganVzdCBleHRyYWN0aW5nIG9yIHJlYXJyYW5naW5nIHRpbGVzLjwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gQWN0aW9uIGJ1dHRvbnNcbiAgY29uc3QgY2FuQWN0ID0gc3RhdGUuaW1hZ2VMb2FkZWQgJiYgIXN0YXRlLnNoZWV0UHJvY2Vzc2luZztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNlY3Rpb25cIj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtYWN0aW9uc1wiPic7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJiYXRjaC1idG5cIiBpZD1cInNoZWV0LXByZXZpZXctYnRuXCIke2NhbkFjdCA/ICcnIDogJyBkaXNhYmxlZCd9PlByZXZpZXcgU3BsaXQ8L2J1dHRvbj5gO1xuICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1wcmltYXJ5XCIgaWQ9XCJzaGVldC1wcm9jZXNzLWJ0blwiJHtjYW5BY3QgPyAnJyA6ICcgZGlzYWJsZWQnfT5Qcm9jZXNzIFNoZWV0PC9idXR0b24+YDtcbiAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cImJhdGNoLWJ0blwiIGlkPVwic2hlZXQtc2F2ZS10aWxlcy1idG5cIiR7c3RhdGUuc2hlZXRQcmV2aWV3ICYmICFzdGF0ZS5zaGVldFByb2Nlc3NpbmcgPyAnJyA6ICcgZGlzYWJsZWQnfT5TYXZlIFRpbGVzPC9idXR0b24+YDtcbiAgaHRtbCArPSAnPC9kaXY+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj48c3Ryb25nPlByZXZpZXcgU3BsaXQ8L3N0cm9uZz4gc2hvd3MgaG93IG1hbnkgdGlsZXMgd2lsbCBiZSBleHRyYWN0ZWQuIDxzdHJvbmc+UHJvY2VzcyBTaGVldDwvc3Ryb25nPiBydW5zIHRoZSBub3JtYWxpemUgcGlwZWxpbmUgb24gZWFjaCB0aWxlIGFuZCByZWFzc2VtYmxlcy4gPHN0cm9uZz5TYXZlIFRpbGVzPC9zdHJvbmc+IGV4cG9ydHMgZWFjaCB0aWxlIGFzIGEgc2VwYXJhdGUgUE5HLjwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gUHJldmlldyBpbmZvXG4gIGlmIChzdGF0ZS5zaGVldFByZXZpZXcpIHtcbiAgICBjb25zdCBwID0gc3RhdGUuc2hlZXRQcmV2aWV3O1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2hlZXQtaW5mb1wiPiR7cC50aWxlQ291bnR9IHRpbGVzICZtZGFzaDsgJHtwLmNvbHN9XFx1MDBkNyR7cC5yb3dzfSBncmlkICZtZGFzaDsgJHtwLnRpbGVXaWR0aH1cXHUwMGQ3JHtwLnRpbGVIZWlnaHR9cHggZWFjaDwvZGl2PmA7XG4gICAgaHRtbCArPSAnPC9kaXY+JztcblxuICAgIC8vIEdJRiBhbmltYXRpb24gc2VjdGlvblxuICAgIGNvbnN0IGdpZkRpcyA9IHN0YXRlLmdpZkdlbmVyYXRpbmcgPyAnIGRpc2FibGVkJyA6ICcnO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtdGl0bGVcIiBzdHlsZT1cIm1hcmdpbi10b3A6NHB4XCI+R0lGIEFuaW1hdGlvbjwvZGl2Pic7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5HZW5lcmF0ZSBhbiBhbmltYXRlZCBHSUYgZnJvbSB0aGUgcHJvY2Vzc2VkIHRpbGVzLiBQcmV2aWV3IGl0IGhlcmUgb3IgZXhwb3J0IHRvIGEgZmlsZS48L2Rpdj4nO1xuXG4gICAgLy8gTW9kZSB0b2dnbGVcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtc2V0dGluZ1wiPjxzcGFuIGNsYXNzPVwic2hlZXQtc2V0dGluZy1sYWJlbFwiPkFuaW1hdGU8L3NwYW4+JztcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtbW9kZS10b2dnbGVcIj4nO1xuICAgIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJzaGVldC1tb2RlLWJ0biBnaWYtbW9kZS1idG4ke3N0YXRlLmdpZk1vZGUgPT09ICdyb3cnID8gJyBhY3RpdmUnIDogJyd9XCIgZGF0YS1naWYtbW9kZT1cInJvd1wiJHtnaWZEaXN9PkJ5IFJvdzwvYnV0dG9uPmA7XG4gICAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cInNoZWV0LW1vZGUtYnRuIGdpZi1tb2RlLWJ0biR7c3RhdGUuZ2lmTW9kZSA9PT0gJ2FsbCcgPyAnIGFjdGl2ZScgOiAnJ31cIiBkYXRhLWdpZi1tb2RlPVwiYWxsXCIke2dpZkRpc30+RW50aXJlIFNoZWV0PC9idXR0b24+YDtcbiAgICBodG1sICs9ICc8L2Rpdj48L2Rpdj4nO1xuXG4gICAgLy8gUm93IHNlbGVjdG9yIChyb3cgbW9kZSBvbmx5KVxuICAgIGlmIChzdGF0ZS5naWZNb2RlID09PSAncm93Jykge1xuICAgICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5Sb3c8L3NwYW4+JztcbiAgICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwiZ2lmLXJvd1wiIHZhbHVlPVwiJHtzdGF0ZS5naWZSb3d9XCIgbWluPVwiMFwiIG1heD1cIiR7cC5yb3dzIC0gMX1cIiR7Z2lmRGlzfT48L2Rpdj5gO1xuICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5XaGljaCByb3cgdG8gYW5pbWF0ZSAoMFxcdTIwMTMke3Aucm93cyAtIDF9KS4gRWFjaCByb3cgYmVjb21lcyBvbmUgYW5pbWF0aW9uIHNlcXVlbmNlLjwvZGl2PmA7XG4gICAgfVxuXG4gICAgLy8gRlBTIGlucHV0XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5GcmFtZSBSYXRlPC9zcGFuPic7XG4gICAgaHRtbCArPSBgPGlucHV0IGNsYXNzPVwic2hlZXQtaW5wdXRcIiB0eXBlPVwibnVtYmVyXCIgaWQ9XCJnaWYtZnBzXCIgdmFsdWU9XCIke3N0YXRlLmdpZkZwc31cIiBtaW49XCIxXCIgbWF4PVwiMTAwXCIke2dpZkRpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPkZyYW1lcyBwZXIgc2Vjb25kICgxXFx1MjAxMzEwMCkuIDEwIGZwcyBpcyBhIGdvb2QgZGVmYXVsdCBmb3IgcGl4ZWwgYXJ0IGFuaW1hdGlvbnMuPC9kaXY+JztcblxuICAgIC8vIEFjdGlvbiBidXR0b25zXG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWFjdGlvbnNcIiBzdHlsZT1cIm1hcmdpbi10b3A6NHB4XCI+JztcbiAgICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1wcmltYXJ5XCIgaWQ9XCJnaWYtcHJldmlldy1idG5cIiR7Z2lmRGlzfT5QcmV2aWV3IEdJRjwvYnV0dG9uPmA7XG4gICAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cImJhdGNoLWJ0blwiIGlkPVwiZ2lmLWV4cG9ydC1idG5cIiR7c3RhdGUuZ2lmUHJldmlld1VybCAmJiAhc3RhdGUuZ2lmR2VuZXJhdGluZyA/ICcnIDogJyBkaXNhYmxlZCd9PkV4cG9ydCBHSUY8L2J1dHRvbj5gO1xuICAgIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgICAvLyBHZW5lcmF0aW5nIGluZGljYXRvclxuICAgIGlmIChzdGF0ZS5naWZHZW5lcmF0aW5nKSB7XG4gICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaW5mb1wiIHN0eWxlPVwiY29sb3I6dmFyKC0tbWF1dmUpO21hcmdpbi10b3A6NnB4XCI+R2VuZXJhdGluZyBHSUYuLi48L2Rpdj4nO1xuICAgIH1cblxuICAgIC8vIFByZXZpZXcgYXJlYVxuICAgIGlmIChzdGF0ZS5naWZQcmV2aWV3VXJsKSB7XG4gICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiZ2lmLXByZXZpZXctY29udGFpbmVyXCI+JztcbiAgICAgIGh0bWwgKz0gYDxpbWcgY2xhc3M9XCJnaWYtcHJldmlldy1pbWdcIiBzcmM9XCIke3N0YXRlLmdpZlByZXZpZXdVcmx9XCIgYWx0PVwiR0lGIFByZXZpZXdcIj5gO1xuICAgICAgaHRtbCArPSAnPC9kaXY+JztcbiAgICB9XG5cbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICB9XG5cbiAgaWYgKHN0YXRlLnNoZWV0UHJvY2Vzc2luZykge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+PGRpdiBjbGFzcz1cInNoZWV0LWluZm9cIiBzdHlsZT1cImNvbG9yOnZhcigtLW1hdXZlKVwiPlByb2Nlc3NpbmcuLi48L2Rpdj48L2Rpdj4nO1xuICB9XG5cbiAgZWwuaW5uZXJIVE1MID0gaHRtbDtcbn1cblxuZnVuY3Rpb24gcmVhZFNoZWV0Q29uZmlnKCk6IHZvaWQge1xuICBjb25zdCBzYyA9IHN0YXRlLnNoZWV0Q29uZmlnO1xuICBpZiAoc3RhdGUuc2hlZXRNb2RlID09PSAnZml4ZWQnKSB7XG4gICAgY29uc3QgdHcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hlZXQtdHcnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBjb25zdCB0aCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC10aCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHNwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NoZWV0LXNwJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgbWcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hlZXQtbWcnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodHcpIHsgY29uc3QgdiA9IHBhcnNlSW50KHR3LnZhbHVlKTsgc2MudGlsZVdpZHRoID0gaXNOYU4odikgfHwgdiA8IDEgPyBudWxsIDogdjsgfVxuICAgIGlmICh0aCkgeyBjb25zdCB2ID0gcGFyc2VJbnQodGgudmFsdWUpOyBzYy50aWxlSGVpZ2h0ID0gaXNOYU4odikgfHwgdiA8IDEgPyBudWxsIDogdjsgfVxuICAgIGlmIChzcCkgeyBjb25zdCB2ID0gcGFyc2VJbnQoc3AudmFsdWUpOyBzYy5zcGFjaW5nID0gaXNOYU4odikgPyAwIDogTWF0aC5tYXgoMCwgdik7IH1cbiAgICBpZiAobWcpIHsgY29uc3QgdiA9IHBhcnNlSW50KG1nLnZhbHVlKTsgc2MubWFyZ2luID0gaXNOYU4odikgPyAwIDogTWF0aC5tYXgoMCwgdik7IH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBzZXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hlZXQtc2VwJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgbWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NoZWV0LW1pbicpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHBhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC1wYWQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoc2VwKSB7IGNvbnN0IHYgPSBwYXJzZUZsb2F0KHNlcC52YWx1ZSk7IHNjLnNlcGFyYXRvclRocmVzaG9sZCA9IGlzTmFOKHYpID8gMC45MCA6IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHYpKTsgfVxuICAgIGlmIChtaW4pIHsgY29uc3QgdiA9IHBhcnNlSW50KG1pbi52YWx1ZSk7IHNjLm1pblNwcml0ZVNpemUgPSBpc05hTih2KSA/IDggOiBNYXRoLm1heCgxLCB2KTsgfVxuICAgIGlmIChwYWQpIHsgY29uc3QgdiA9IHBhcnNlSW50KHBhZC52YWx1ZSk7IHNjLnBhZCA9IGlzTmFOKHYpID8gMCA6IE1hdGgubWF4KDAsIHYpOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRTaGVldEFyZ3MoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICBjb25zdCBzYyA9IHN0YXRlLnNoZWV0Q29uZmlnO1xuICByZXR1cm4ge1xuICAgIG1vZGU6IHN0YXRlLnNoZWV0TW9kZSxcbiAgICB0aWxlV2lkdGg6IHNjLnRpbGVXaWR0aCxcbiAgICB0aWxlSGVpZ2h0OiBzYy50aWxlSGVpZ2h0LFxuICAgIHNwYWNpbmc6IHNjLnNwYWNpbmcsXG4gICAgbWFyZ2luOiBzYy5tYXJnaW4sXG4gICAgc2VwYXJhdG9yVGhyZXNob2xkOiBzYy5zZXBhcmF0b3JUaHJlc2hvbGQsXG4gICAgbWluU3ByaXRlU2l6ZTogc2MubWluU3ByaXRlU2l6ZSxcbiAgICBwYWQ6IHNjLnBhZCxcbiAgICBub05vcm1hbGl6ZTogc2Mubm9Ob3JtYWxpemUgfHwgbnVsbCxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hlZXRQcmV2aWV3QWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIXN0YXRlLmltYWdlTG9hZGVkIHx8IHN0YXRlLnNoZWV0UHJvY2Vzc2luZykgcmV0dXJuO1xuICByZWFkU2hlZXRDb25maWcoKTtcbiAgc3RhdGUuc2hlZXRQcm9jZXNzaW5nID0gdHJ1ZTtcbiAgcmVuZGVyU2hlZXQoKTtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2U8eyB0aWxlQ291bnQ6IG51bWJlcjsgdGlsZVdpZHRoOiBudW1iZXI7IHRpbGVIZWlnaHQ6IG51bWJlcjsgY29sczogbnVtYmVyOyByb3dzOiBudW1iZXIgfT4oJ3NoZWV0X3ByZXZpZXcnLCBidWlsZFNoZWV0QXJncygpKTtcbiAgICBzdGF0ZS5zaGVldFByZXZpZXcgPSByZXN1bHQ7XG4gICAgc2V0U3RhdHVzKGBTaGVldDogJHtyZXN1bHQudGlsZUNvdW50fSB0aWxlcyAoJHtyZXN1bHQuY29sc31cXHUwMGQ3JHtyZXN1bHQucm93c30pYCwgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnU2hlZXQgZXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgICBzdGF0ZS5zaGVldFByZXZpZXcgPSBudWxsO1xuICB9IGZpbmFsbHkge1xuICAgIHN0YXRlLnNoZWV0UHJvY2Vzc2luZyA9IGZhbHNlO1xuICAgIHJlbmRlclNoZWV0KCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hlZXRQcm9jZXNzQWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIXN0YXRlLmltYWdlTG9hZGVkIHx8IHN0YXRlLnNoZWV0UHJvY2Vzc2luZykgcmV0dXJuO1xuICByZWFkU2hlZXRDb25maWcoKTtcbiAgc3RhdGUuc2hlZXRQcm9jZXNzaW5nID0gdHJ1ZTtcbiAgc3RhdGUuZ2lmUHJldmlld1VybCA9IG51bGw7XG4gIHJlbmRlclNoZWV0KCk7XG4gIHNldFN0YXR1cygnUHJvY2Vzc2luZyBzaGVldC4uLicsICdwcm9jZXNzaW5nJyk7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIHRyeSB7XG4gICAgY29uc3QgYXJncyA9IHsgLi4uYnVpbGRTaGVldEFyZ3MoKSwgcGM6IGJ1aWxkUHJvY2Vzc0NvbmZpZygpIH07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlPHsgdGlsZUNvdW50OiBudW1iZXI7IHRpbGVXaWR0aDogbnVtYmVyOyB0aWxlSGVpZ2h0OiBudW1iZXI7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyOyBvdXRwdXRXaWR0aDogbnVtYmVyOyBvdXRwdXRIZWlnaHQ6IG51bWJlciB9Pignc2hlZXRfcHJvY2VzcycsIGFyZ3MpO1xuICAgIHN0YXRlLnNoZWV0UHJldmlldyA9IHJlc3VsdDtcblxuICAgIC8vIFVwZGF0ZSBwcmV2aWV3IHdpdGggdGhlIHByb2Nlc3NlZCBzaGVldFxuICAgIGNvbnN0IHByb2NVcmwgPSBhd2FpdCBsb2FkSW1hZ2VCbG9iKCdwcm9jZXNzZWQnKTtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Byb2Nlc3NlZC1pbWcnKSBhcyBIVE1MSW1hZ2VFbGVtZW50KS5zcmMgPSBwcm9jVXJsO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwcm9jZXNzZWQtZGltcycpIS50ZXh0Q29udGVudCA9IGAke3Jlc3VsdC5vdXRwdXRXaWR0aH1cXHUwMGQ3JHtyZXN1bHQub3V0cHV0SGVpZ2h0fWA7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5ncy1wcmV2aWV3LWltZycpIGFzIEhUTUxJbWFnZUVsZW1lbnQpLnNyYyA9IHByb2NVcmw7XG5cbiAgICBjb25zdCBlbGFwc2VkID0gKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAvIDEwMDApLnRvRml4ZWQoMik7XG4gICAgc2V0U3RhdHVzKGBTaGVldCBwcm9jZXNzZWQ6ICR7cmVzdWx0LnRpbGVDb3VudH0gdGlsZXMsICR7cmVzdWx0Lm91dHB1dFdpZHRofVxcdTAwZDcke3Jlc3VsdC5vdXRwdXRIZWlnaHR9ICgke2VsYXBzZWR9cylgLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc2V0U3RhdHVzKCdTaGVldCBlcnJvcjogJyArIGUsICdlcnJvcicpO1xuICB9IGZpbmFsbHkge1xuICAgIHN0YXRlLnNoZWV0UHJvY2Vzc2luZyA9IGZhbHNlO1xuICAgIHJlbmRlclNoZWV0KCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hlZXRTYXZlVGlsZXNBY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlbkRpYWxvZyh7IGRpcmVjdG9yeTogdHJ1ZSB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBjb25zdCBkaXIgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XG4gICAgICBjb25zdCBjb3VudCA9IGF3YWl0IGludm9rZTxudW1iZXI+KCdzaGVldF9zYXZlX3RpbGVzJywgeyBvdXRwdXREaXI6IGRpciB9KTtcbiAgICAgIHNldFN0YXR1cyhgU2F2ZWQgJHtjb3VudH0gdGlsZXMgdG8gJHtkaXIuc3BsaXQoJy8nKS5wb3AoKSEuc3BsaXQoJ1xcXFwnKS5wb3AoKSF9YCwgJ3N1Y2Nlc3MnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yIHNhdmluZyB0aWxlczogJyArIGUsICdlcnJvcicpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRHaWZDb25maWcoKTogdm9pZCB7XG4gIGNvbnN0IHJvd0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dpZi1yb3cnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgY29uc3QgZnBzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2lmLWZwcycpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBpZiAocm93RWwpIHtcbiAgICBjb25zdCB2ID0gcGFyc2VJbnQocm93RWwudmFsdWUpO1xuICAgIHN0YXRlLmdpZlJvdyA9IGlzTmFOKHYpID8gMCA6IE1hdGgubWF4KDAsIHYpO1xuICB9XG4gIGlmIChmcHNFbCkge1xuICAgIGNvbnN0IHYgPSBwYXJzZUludChmcHNFbC52YWx1ZSk7XG4gICAgc3RhdGUuZ2lmRnBzID0gaXNOYU4odikgPyAxMCA6IE1hdGgubWF4KDEsIE1hdGgubWluKDEwMCwgdikpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdpZlByZXZpZXdBY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmIChzdGF0ZS5naWZHZW5lcmF0aW5nKSByZXR1cm47XG4gIHJlYWRHaWZDb25maWcoKTtcbiAgc3RhdGUuZ2lmR2VuZXJhdGluZyA9IHRydWU7XG4gIHN0YXRlLmdpZlByZXZpZXdVcmwgPSBudWxsO1xuICByZW5kZXJTaGVldCgpO1xuICBzZXRTdGF0dXMoJ0dlbmVyYXRpbmcgR0lGIHByZXZpZXcuLi4nLCAncHJvY2Vzc2luZycpO1xuICB0cnkge1xuICAgIGNvbnN0IGRhdGFVcmwgPSBhd2FpdCBpbnZva2U8c3RyaW5nPignc2hlZXRfZ2VuZXJhdGVfZ2lmJywge1xuICAgICAgbW9kZTogc3RhdGUuZ2lmTW9kZSxcbiAgICAgIHJvdzogc3RhdGUuZ2lmTW9kZSA9PT0gJ3JvdycgPyBzdGF0ZS5naWZSb3cgOiBudWxsLFxuICAgICAgZnBzOiBzdGF0ZS5naWZGcHMsXG4gICAgfSk7XG4gICAgc3RhdGUuZ2lmUHJldmlld1VybCA9IGRhdGFVcmw7XG4gICAgc2V0U3RhdHVzKCdHSUYgcHJldmlldyBnZW5lcmF0ZWQnLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc2V0U3RhdHVzKCdHSUYgZXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzdGF0ZS5naWZHZW5lcmF0aW5nID0gZmFsc2U7XG4gICAgcmVuZGVyU2hlZXQoKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnaWZFeHBvcnRBY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghc3RhdGUuZ2lmUHJldmlld1VybCkgcmV0dXJuO1xuICByZWFkR2lmQ29uZmlnKCk7XG4gIHRyeSB7XG4gICAgY29uc3QgZGVmYXVsdE5hbWUgPSBzdGF0ZS5naWZNb2RlID09PSAncm93JyA/IGByb3dfJHtzdGF0ZS5naWZSb3d9LmdpZmAgOiAnYW5pbWF0aW9uLmdpZic7XG4gICAgY29uc3QgcGF0aCA9IGF3YWl0IHNhdmVEaWFsb2coe1xuICAgICAgZmlsdGVyczogW3sgbmFtZTogJ0dJRicsIGV4dGVuc2lvbnM6IFsnZ2lmJ10gfV0sXG4gICAgICBkZWZhdWx0UGF0aDogZGVmYXVsdE5hbWUsXG4gICAgfSk7XG4gICAgaWYgKHBhdGgpIHtcbiAgICAgIHNldFN0YXR1cygnRXhwb3J0aW5nIEdJRi4uLicsICdwcm9jZXNzaW5nJyk7XG4gICAgICBhd2FpdCBpbnZva2UoJ3NoZWV0X2V4cG9ydF9naWYnLCB7XG4gICAgICAgIHBhdGgsXG4gICAgICAgIG1vZGU6IHN0YXRlLmdpZk1vZGUsXG4gICAgICAgIHJvdzogc3RhdGUuZ2lmTW9kZSA9PT0gJ3JvdycgPyBzdGF0ZS5naWZSb3cgOiBudWxsLFxuICAgICAgICBmcHM6IHN0YXRlLmdpZkZwcyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgZm5hbWUgPSAocGF0aCBhcyBzdHJpbmcpLnNwbGl0KCcvJykucG9wKCkhLnNwbGl0KCdcXFxcJykucG9wKCkhO1xuICAgICAgc2V0U3RhdHVzKGBHSUYgc2F2ZWQgdG8gJHtmbmFtZX1gLCAnc3VjY2VzcycpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnR0lGIGV4cG9ydCBlcnJvcjogJyArIGUsICdlcnJvcicpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVGFiIGNsaWNrIGhhbmRsaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnRhYi1iYXInKSEuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZTogRXZlbnQpID0+IHtcbiAgY29uc3QgdGFiID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudGFiJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAodGFiKSBzd2l0Y2hUYWIodGFiLmRhdGFzZXQudGFiISk7XG59KTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBEcmFnIGFuZCBkcm9wXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgZHJvcE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZHJvcC1vdmVybGF5JykhO1xubGV0IGRyYWdDb3VudGVyID0gMDtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VudGVyJywgKGU6IERyYWdFdmVudCkgPT4ge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIGRyYWdDb3VudGVyKys7XG4gIGRyb3BPdmVybGF5LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xufSk7XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdsZWF2ZScsIChlOiBEcmFnRXZlbnQpID0+IHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICBkcmFnQ291bnRlci0tO1xuICBpZiAoZHJhZ0NvdW50ZXIgPD0gMCkge1xuICAgIGRyYWdDb3VudGVyID0gMDtcbiAgICBkcm9wT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgfVxufSk7XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGU6IERyYWdFdmVudCkgPT4ge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG59KTtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJvcCcsIGFzeW5jIChlOiBEcmFnRXZlbnQpID0+IHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICBkcmFnQ291bnRlciA9IDA7XG4gIGRyb3BPdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXG4gIGNvbnN0IGZpbGVzID0gZS5kYXRhVHJhbnNmZXI/LmZpbGVzO1xuICBpZiAoZmlsZXMgJiYgZmlsZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGZpbGUgPSBmaWxlc1swXSBhcyBGaWxlICYgeyBwYXRoPzogc3RyaW5nIH07XG4gICAgaWYgKGZpbGUucGF0aCkge1xuICAgICAgYXdhaXQgb3BlbkltYWdlKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG59KTtcblxuLy8gVGF1cmkgbmF0aXZlIGZpbGUgZHJvcCBldmVudHNcbmlmICh3aW5kb3cuX19UQVVSSV9fPy5ldmVudCkge1xuICB3aW5kb3cuX19UQVVSSV9fLmV2ZW50Lmxpc3RlbigndGF1cmk6Ly9kcmFnLWRyb3AnLCBhc3luYyAoZXZlbnQ6IFRhdXJpRXZlbnQpID0+IHtcbiAgICBkcm9wT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICBkcmFnQ291bnRlciA9IDA7XG4gICAgY29uc3QgcGF0aHMgPSBldmVudC5wYXlsb2FkPy5wYXRocztcbiAgICBpZiAocGF0aHMgJiYgcGF0aHMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgb3BlbkltYWdlKHBhdGhzWzBdKTtcbiAgICB9XG4gIH0pO1xuXG4gIHdpbmRvdy5fX1RBVVJJX18uZXZlbnQubGlzdGVuKCd0YXVyaTovL2RyYWctZW50ZXInLCAoKSA9PiB7XG4gICAgZHJvcE92ZXJsYXkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gIH0pO1xuXG4gIHdpbmRvdy5fX1RBVVJJX18uZXZlbnQubGlzdGVuKCd0YXVyaTovL2RyYWctbGVhdmUnLCAoKSA9PiB7XG4gICAgZHJvcE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgZHJhZ0NvdW50ZXIgPSAwO1xuICB9KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTZXR0aW5ncyBjbGljayBoYW5kbGluZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5ncy1saXN0JykhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGU6IEV2ZW50KSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXG4gIC8vIENsZWFyIGJ1dHRvbiBjbGljayAow5cgdG8gcmVzZXQgbnVsbGFibGUgc2V0dGluZylcbiAgaWYgKHRhcmdldC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdzZXR0aW5nLWNsZWFyJykgJiYgIXN0YXRlLnByb2Nlc3NpbmcpIHtcbiAgICBza2lwTmV4dEJsdXJDb21taXQgPSB0cnVlO1xuICAgIGNvbnN0IGtleSA9IHRhcmdldC5kYXRhc2V0LmtleSE7XG4gICAgY2xlYXJTZXR0aW5nKGtleSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQm9vbGVhbiBvciBudWxsYWJsZS1vZmYgdG9nZ2xlIGNsaWNrXG4gIGlmICh0YXJnZXQuY2xhc3NMaXN0Py5jb250YWlucygnc2V0dGluZy10b2dnbGUnKSAmJiAhc3RhdGUucHJvY2Vzc2luZykge1xuICAgIGNvbnN0IGtleSA9IHRhcmdldC5kYXRhc2V0LmtleSE7XG4gICAgY29uc3Qgcm93ID0gdGFyZ2V0LmNsb3Nlc3QoJy5zZXR0aW5nLXJvdycpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAocm93KSBzdGF0ZS5zZXR0aW5nc0ZvY3VzSW5kZXggPSBwYXJzZUludChyb3cuZGF0YXNldC5pbmRleCEpO1xuICAgIGlmIChCT09MRUFOX1NFVFRJTkdTLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGFkanVzdFNldHRpbmcoa2V5LCAxKTtcbiAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgICBhdXRvUHJvY2VzcygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBOdWxsYWJsZSBzZXR0aW5nIGluIFwib2ZmXCIgc3RhdGUg4oCUIGVuYWJsZSBpdFxuICAgICAgc3RhcnRFZGl0aW5nKGtleSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsaWNrIG9uIHJvdyB0byBmb2N1cyBpdFxuICBjb25zdCByb3cgPSB0YXJnZXQuY2xvc2VzdCgnLnNldHRpbmctcm93JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAocm93KSB7XG4gICAgc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ID0gcGFyc2VJbnQocm93LmRhdGFzZXQuaW5kZXghKTtcbiAgICByZW5kZXJTZXR0aW5ncygpO1xuICB9XG59KTtcblxuLy8gQ29tbWl0IGlubGluZSBpbnB1dCBvbiBibHVyXG5sZXQgc2tpcE5leHRCbHVyQ29tbWl0ID0gZmFsc2U7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtbGlzdCcpIS5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIChlOiBGb2N1c0V2ZW50KSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICBpZiAodGFyZ2V0LmNsYXNzTGlzdD8uY29udGFpbnMoJ3NldHRpbmctaW5saW5lLWlucHV0JykpIHtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmIChza2lwTmV4dEJsdXJDb21taXQpIHsgc2tpcE5leHRCbHVyQ29tbWl0ID0gZmFsc2U7IHJldHVybjsgfVxuICAgICAgY29tbWl0RWRpdCgodGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmRhdGFzZXQua2V5ISwgKHRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgfSwgNTApO1xuICB9XG59KTtcblxuLy8gQ29tbWl0IHNlbGVjdCBjaGFuZ2VzXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtbGlzdCcpIS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZTogRXZlbnQpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gIGlmICh0YXJnZXQudGFnTmFtZSA9PT0gJ1NFTEVDVCcgJiYgdGFyZ2V0LmNsYXNzTGlzdD8uY29udGFpbnMoJ3NldHRpbmctaW5saW5lLXNlbGVjdCcpKSB7XG4gICAgY29tbWl0RWRpdCh0YXJnZXQuZGF0YXNldC5rZXkhLCB0YXJnZXQudmFsdWUpO1xuICB9XG59KTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBJbml0XG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuYXN5bmMgZnVuY3Rpb24gaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBzdGF0ZS5wYWxldHRlcyA9IGF3YWl0IGludm9rZTxQYWxldHRlSW5mb1tdPignbGlzdF9wYWxldHRlcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgcGFsZXR0ZXM6JywgZSk7XG4gIH1cbiAgcmVuZGVyU2V0dGluZ3MoKTtcbiAgcmVuZGVyRGlhZ25vc3RpY3MoKTtcbiAgcmVuZGVyQmF0Y2goKTtcbiAgcmVuZGVyU2hlZXQoKTtcbn1cblxuLy8gQmF0Y2ggcGFuZWwgY2xpY2sgZGVsZWdhdGlvblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JhdGNoLWNvbnRlbnQnKSEuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZTogRXZlbnQpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gIGlmICh0YXJnZXQuaWQgPT09ICdiYXRjaC1hZGQtZmlsZXMnKSB7IGJhdGNoQWRkRmlsZXMoKTsgcmV0dXJuOyB9XG4gIGlmICh0YXJnZXQuaWQgPT09ICdiYXRjaC1jbGVhci1maWxlcycpIHsgc3RhdGUuYmF0Y2hGaWxlcyA9IFtdOyBzdGF0ZS5iYXRjaFJlc3VsdCA9IG51bGw7IHJlbmRlckJhdGNoKCk7IHJldHVybjsgfVxuICBpZiAodGFyZ2V0LmlkID09PSAnYmF0Y2gtY2hvb3NlLWRpcicpIHsgYmF0Y2hDaG9vc2VEaXIoKTsgcmV0dXJuOyB9XG4gIGlmICh0YXJnZXQuaWQgPT09ICdiYXRjaC1ydW4nKSB7IGJhdGNoUnVuKCk7IHJldHVybjsgfVxufSk7XG5cbi8vIFNoZWV0IHBhbmVsIGNsaWNrIGRlbGVnYXRpb25cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC1jb250ZW50JykhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGU6IEV2ZW50KSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICBpZiAodGFyZ2V0LmNsYXNzTGlzdD8uY29udGFpbnMoJ3NoZWV0LW1vZGUtYnRuJykgJiYgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2dpZi1tb2RlLWJ0bicpKSB7XG4gICAgY29uc3QgbW9kZSA9IHRhcmdldC5kYXRhc2V0Lm1vZGUgYXMgJ2ZpeGVkJyB8ICdhdXRvJztcbiAgICBpZiAobW9kZSkgeyBzdGF0ZS5zaGVldE1vZGUgPSBtb2RlOyBzdGF0ZS5zaGVldFByZXZpZXcgPSBudWxsOyByZW5kZXJTaGVldCgpOyB9XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0YXJnZXQuY2xhc3NMaXN0Py5jb250YWlucygnZ2lmLW1vZGUtYnRuJykpIHtcbiAgICBjb25zdCBnaWZNb2RlID0gdGFyZ2V0LmRhdGFzZXQuZ2lmTW9kZSBhcyAncm93JyB8ICdhbGwnO1xuICAgIGlmIChnaWZNb2RlKSB7IHN0YXRlLmdpZk1vZGUgPSBnaWZNb2RlOyBzdGF0ZS5naWZQcmV2aWV3VXJsID0gbnVsbDsgcmVuZGVyU2hlZXQoKTsgfVxuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGFyZ2V0LmlkID09PSAnc2hlZXQtbm8tbm9ybWFsaXplJykgeyBzdGF0ZS5zaGVldENvbmZpZy5ub05vcm1hbGl6ZSA9ICFzdGF0ZS5zaGVldENvbmZpZy5ub05vcm1hbGl6ZTsgcmVuZGVyU2hlZXQoKTsgcmV0dXJuOyB9XG4gIGlmICh0YXJnZXQuaWQgPT09ICdzaGVldC1wcmV2aWV3LWJ0bicpIHsgc2hlZXRQcmV2aWV3QWN0aW9uKCk7IHJldHVybjsgfVxuICBpZiAodGFyZ2V0LmlkID09PSAnc2hlZXQtcHJvY2Vzcy1idG4nKSB7IHNoZWV0UHJvY2Vzc0FjdGlvbigpOyByZXR1cm47IH1cbiAgaWYgKHRhcmdldC5pZCA9PT0gJ3NoZWV0LXNhdmUtdGlsZXMtYnRuJykgeyBzaGVldFNhdmVUaWxlc0FjdGlvbigpOyByZXR1cm47IH1cbiAgaWYgKHRhcmdldC5pZCA9PT0gJ2dpZi1wcmV2aWV3LWJ0bicpIHsgZ2lmUHJldmlld0FjdGlvbigpOyByZXR1cm47IH1cbiAgaWYgKHRhcmdldC5pZCA9PT0gJ2dpZi1leHBvcnQtYnRuJykgeyBnaWZFeHBvcnRBY3Rpb24oKTsgcmV0dXJuOyB9XG59KTtcblxuaW5pdCgpO1xuIgogIF0sCiAgIm1hcHBpbmdzIjogIjtBQW1DQSxNQUFRLFdBQVcsT0FBTyxVQUFVO0FBQ3BDLE1BQVEsTUFBTSxZQUFZLE1BQU0sZUFBZSxPQUFPLFVBQVU7QUFnSmhFLElBQU0s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QUFNLE9BQU8sVUFBVSxTQUFTLGNBQWMsR0FBRztBQUM5RixVQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzVCLFFBQUksTUFBTTtBQUFFLFlBQU0sWUFBWTtBQUFNLFlBQU0sZUFBZTtBQUFNLGtCQUFZO0FBQUEsSUFBRztBQUM5RTtBQUFBLEVBQ0Y7QUFDQSxNQUFJLE9BQU8sV0FBVyxTQUFTLGNBQWMsR0FBRztBQUM5QyxVQUFNLFVBQVUsT0FBTyxRQUFRO0FBQy9CLFFBQUksU0FBUztBQUFFLFlBQU0sVUFBVTtBQUFTLFlBQU0sZ0JBQWdCO0FBQU0sa0JBQVk7QUFBQSxJQUFHO0FBQ25GO0FBQUEsRUFDRjtBQUNBLE1BQUksT0FBTyxPQUFPLHNCQUFzQjtBQUFFLFVBQU0sWUFBWSxlQUFlLE1BQU0sWUFBWTtBQUFhLGdCQUFZO0FBQUc7QUFBQSxFQUFRO0FBQ2pJLE1BQUksT0FBTyxPQUFPLHFCQUFxQjtBQUFFLHVCQUFtQjtBQUFHO0FBQUEsRUFBUTtBQUN2RSxNQUFJLE9BQU8sT0FBTyxxQkFBcUI7QUFBRSx1QkFBbUI7QUFBRztBQUFBLEVBQVE7QUFDdkUsTUFBSSxPQUFPLE9BQU8sd0JBQXdCO0FBQUUseUJBQXFCO0FBQUc7QUFBQSxFQUFRO0FBQzVFLE1BQUksT0FBTyxPQUFPLG1CQUFtQjtBQUFFLHFCQUFpQjtBQUFHO0FBQUEsRUFBUTtBQUNuRSxNQUFJLE9BQU8sT0FBTyxrQkFBa0I7QUFBRSxvQkFBZ0I7QUFBRztBQUFBLEVBQVE7QUFBQSxDQUNsRTtBQUVELEtBQUs7IiwKICAiZGVidWdJZCI6ICI4RDM5RTEwRTVFRjhBMDNDNjQ3NTZFMjE2NDc1NkUyMSIsCiAgIm5hbWVzIjogW10KfQ==
