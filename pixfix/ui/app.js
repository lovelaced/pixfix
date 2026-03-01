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
  const welcome = document.getElementById("welcome");
  const loading = document.getElementById("welcome-loading");
  welcome.style.display = "none";
  loading.style.display = "flex";
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
    if (wasOnWelcome) {
      document.getElementById("welcome").style.display = "flex";
    }
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

//# debugId=D0F557625708B3BF64756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsicGl4Zml4L3VpL3NyYy9hcHAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbCiAgICAiLy8gcGl4Zml4IOKAlCBhcHBsaWNhdGlvbiBsb2dpYyAoVHlwZVNjcmlwdClcbi8vIFVzZXMgd2luZG93Ll9fVEFVUklfXyAod2l0aEdsb2JhbFRhdXJpOiB0cnVlIGluIHRhdXJpLmNvbmYuanNvbilcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUYXVyaSBBUEkgYmluZGluZ3Ncbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5kZWNsYXJlIGdsb2JhbCB7XG4gIGludGVyZmFjZSBXaW5kb3cge1xuICAgIF9fVEFVUklfXzoge1xuICAgICAgY29yZToge1xuICAgICAgICBpbnZva2U6IDxUID0gdW5rbm93bj4oY21kOiBzdHJpbmcsIGFyZ3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gUHJvbWlzZTxUPjtcbiAgICAgIH07XG4gICAgICBkaWFsb2c6IHtcbiAgICAgICAgb3BlbjogKG9wdGlvbnM/OiBEaWFsb2dPcHRpb25zKSA9PiBQcm9taXNlPHN0cmluZyB8IG51bGw+O1xuICAgICAgICBzYXZlOiAob3B0aW9ucz86IERpYWxvZ09wdGlvbnMpID0+IFByb21pc2U8c3RyaW5nIHwgbnVsbD47XG4gICAgICB9O1xuICAgICAgZXZlbnQ6IHtcbiAgICAgICAgbGlzdGVuOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBUYXVyaUV2ZW50KSA9PiB2b2lkKSA9PiBQcm9taXNlPHZvaWQ+O1xuICAgICAgfTtcbiAgICB9O1xuICB9XG59XG5cbmludGVyZmFjZSBEaWFsb2dPcHRpb25zIHtcbiAgbXVsdGlwbGU/OiBib29sZWFuO1xuICBkaXJlY3Rvcnk/OiBib29sZWFuO1xuICBkZWZhdWx0UGF0aD86IHN0cmluZztcbiAgZmlsdGVycz86IHsgbmFtZTogc3RyaW5nOyBleHRlbnNpb25zOiBzdHJpbmdbXSB9W107XG59XG5cbmludGVyZmFjZSBUYXVyaUV2ZW50IHtcbiAgcGF5bG9hZD86IHsgcGF0aHM/OiBzdHJpbmdbXSB9O1xufVxuXG5jb25zdCB7IGludm9rZSB9ID0gd2luZG93Ll9fVEFVUklfXy5jb3JlO1xuY29uc3QgeyBvcGVuOiBvcGVuRGlhbG9nLCBzYXZlOiBzYXZlRGlhbG9nIH0gPSB3aW5kb3cuX19UQVVSSV9fLmRpYWxvZztcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBCYWNrZW5kIHR5cGVzIChtaXJyb3IgUnVzdCBzZXJkZSBzdHJ1Y3RzKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJbWFnZUluZm8ge1xuICB3aWR0aDogbnVtYmVyO1xuICBoZWlnaHQ6IG51bWJlcjtcbiAgZ3JpZFNpemU6IG51bWJlciB8IG51bGw7XG4gIGdyaWRDb25maWRlbmNlOiBudW1iZXIgfCBudWxsO1xuICB1bmlxdWVDb2xvcnM6IG51bWJlcjtcbiAgZ3JpZFNjb3JlczogW251bWJlciwgbnVtYmVyXVtdO1xuICBoaXN0b2dyYW06IENvbG9yRW50cnlbXTtcbn1cblxuaW50ZXJmYWNlIFByb2Nlc3NSZXN1bHQge1xuICB3aWR0aDogbnVtYmVyO1xuICBoZWlnaHQ6IG51bWJlcjtcbiAgZ3JpZFNpemU6IG51bWJlciB8IG51bGw7XG4gIGdyaWRDb25maWRlbmNlOiBudW1iZXIgfCBudWxsO1xuICB1bmlxdWVDb2xvcnM6IG51bWJlcjtcbiAgZ3JpZFNjb3JlczogW251bWJlciwgbnVtYmVyXVtdO1xuICBoaXN0b2dyYW06IENvbG9yRW50cnlbXTtcbn1cblxuaW50ZXJmYWNlIENvbG9yRW50cnkge1xuICBoZXg6IHN0cmluZztcbiAgcjogbnVtYmVyO1xuICBnOiBudW1iZXI7XG4gIGI6IG51bWJlcjtcbiAgcGVyY2VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGFsZXR0ZUluZm8ge1xuICBuYW1lOiBzdHJpbmc7XG4gIHNsdWc6IHN0cmluZztcbiAgbnVtQ29sb3JzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBMb3NwZWNSZXN1bHQge1xuICBuYW1lOiBzdHJpbmc7XG4gIHNsdWc6IHN0cmluZztcbiAgbnVtQ29sb3JzOiBudW1iZXI7XG4gIGNvbG9yczogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBQcm9jZXNzQ29uZmlnIHtcbiAgZ3JpZFNpemU6IG51bWJlciB8IG51bGw7XG4gIGdyaWRQaGFzZVg6IG51bWJlciB8IG51bGw7XG4gIGdyaWRQaGFzZVk6IG51bWJlciB8IG51bGw7XG4gIG1heEdyaWRDYW5kaWRhdGU6IG51bWJlciB8IG51bGw7XG4gIG5vR3JpZERldGVjdDogYm9vbGVhbjtcbiAgZG93bnNjYWxlTW9kZTogc3RyaW5nO1xuICBhYVRocmVzaG9sZDogbnVtYmVyIHwgbnVsbDtcbiAgcGFsZXR0ZU5hbWU6IHN0cmluZyB8IG51bGw7XG4gIGF1dG9Db2xvcnM6IG51bWJlciB8IG51bGw7XG4gIGN1c3RvbVBhbGV0dGU6IHN0cmluZ1tdIHwgbnVsbDtcbiAgcmVtb3ZlQmc6IGJvb2xlYW47XG4gIG5vUXVhbnRpemU6IGJvb2xlYW47XG4gIGJnQ29sb3I6IHN0cmluZyB8IG51bGw7XG4gIGJvcmRlclRocmVzaG9sZDogbnVtYmVyIHwgbnVsbDtcbiAgYmdUb2xlcmFuY2U6IG51bWJlcjtcbiAgZmxvb2RGaWxsOiBib29sZWFuO1xuICBvdXRwdXRTY2FsZTogbnVtYmVyIHwgbnVsbDtcbiAgb3V0cHV0V2lkdGg6IG51bWJlciB8IG51bGw7XG4gIG91dHB1dEhlaWdodDogbnVtYmVyIHwgbnVsbDtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTdGF0ZVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBBcHBDb25maWcge1xuICBncmlkU2l6ZTogbnVtYmVyIHwgbnVsbDtcbiAgZ3JpZFBoYXNlWDogbnVtYmVyIHwgbnVsbDtcbiAgZ3JpZFBoYXNlWTogbnVtYmVyIHwgbnVsbDtcbiAgbWF4R3JpZENhbmRpZGF0ZTogbnVtYmVyO1xuICBub0dyaWREZXRlY3Q6IGJvb2xlYW47XG4gIGRvd25zY2FsZU1vZGU6IHN0cmluZztcbiAgYWFUaHJlc2hvbGQ6IG51bWJlciB8IG51bGw7XG4gIHBhbGV0dGVOYW1lOiBzdHJpbmcgfCBudWxsO1xuICBhdXRvQ29sb3JzOiBudW1iZXIgfCBudWxsO1xuICBsb3NwZWNTbHVnOiBzdHJpbmcgfCBudWxsO1xuICBjdXN0b21QYWxldHRlOiBzdHJpbmdbXSB8IG51bGw7XG4gIG5vUXVhbnRpemU6IGJvb2xlYW47XG4gIHJlbW92ZUJnOiBib29sZWFuO1xuICBiZ0NvbG9yOiBzdHJpbmcgfCBudWxsO1xuICBib3JkZXJUaHJlc2hvbGQ6IG51bWJlciB8IG51bGw7XG4gIGJnVG9sZXJhbmNlOiBudW1iZXI7XG4gIGZsb29kRmlsbDogYm9vbGVhbjtcbiAgb3V0cHV0U2NhbGU6IG51bWJlciB8IG51bGw7XG4gIG91dHB1dFdpZHRoOiBudW1iZXIgfCBudWxsO1xuICBvdXRwdXRIZWlnaHQ6IG51bWJlciB8IG51bGw7XG59XG5cbmludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIGFjdGl2ZVRhYjogc3RyaW5nO1xuICBpbWFnZUxvYWRlZDogYm9vbGVhbjtcbiAgaW1hZ2VQYXRoOiBzdHJpbmcgfCBudWxsO1xuICBpbWFnZUluZm86IEltYWdlSW5mbyB8IG51bGw7XG4gIHNldHRpbmdzRm9jdXNJbmRleDogbnVtYmVyO1xuICBwcm9jZXNzaW5nOiBib29sZWFuO1xuICBwYWxldHRlczogUGFsZXR0ZUluZm9bXTtcbiAgcGFsZXR0ZUluZGV4OiBudW1iZXI7XG4gIGNvbmZpZzogQXBwQ29uZmlnO1xuICAvLyBMb3NwZWMgc3RhdGVcbiAgbG9zcGVjUmVzdWx0OiBMb3NwZWNSZXN1bHQgfCBudWxsO1xuICBsb3NwZWNFcnJvcjogc3RyaW5nIHwgbnVsbDtcbiAgbG9zcGVjTG9hZGluZzogYm9vbGVhbjtcbiAgLy8gUGFsZXR0ZSBzd2F0Y2hlcyBmb3IgY3VycmVudCBzZWxlY3Rpb25cbiAgcGFsZXR0ZUNvbG9yczogc3RyaW5nW10gfCBudWxsO1xuICAvLyBIZWxwIHZpc2liaWxpdHlcbiAgc2hvd0FsbEhlbHA6IGJvb2xlYW47XG4gIC8vIFRpbWluZ1xuICBsYXN0UHJvY2Vzc1RpbWU6IG51bWJlciB8IG51bGw7XG4gIC8vIEJhdGNoIHN0YXRlXG4gIGJhdGNoRmlsZXM6IHN0cmluZ1tdO1xuICBiYXRjaE91dHB1dERpcjogc3RyaW5nIHwgbnVsbDtcbiAgYmF0Y2hSdW5uaW5nOiBib29sZWFuO1xuICBiYXRjaFByb2dyZXNzOiB7IGN1cnJlbnQ6IG51bWJlcjsgdG90YWw6IG51bWJlcjsgZmlsZW5hbWU6IHN0cmluZyB9IHwgbnVsbDtcbiAgYmF0Y2hSZXN1bHQ6IHsgc3VjY2VlZGVkOiBudW1iZXI7IGZhaWxlZDogeyBwYXRoOiBzdHJpbmc7IGVycm9yOiBzdHJpbmcgfVtdIH0gfCBudWxsO1xuICAvLyBTaGVldCBzdGF0ZVxuICBzaGVldE1vZGU6ICdmaXhlZCcgfCAnYXV0byc7XG4gIHNoZWV0Q29uZmlnOiB7XG4gICAgdGlsZVdpZHRoOiBudW1iZXIgfCBudWxsO1xuICAgIHRpbGVIZWlnaHQ6IG51bWJlciB8IG51bGw7XG4gICAgc3BhY2luZzogbnVtYmVyO1xuICAgIG1hcmdpbjogbnVtYmVyO1xuICAgIHNlcGFyYXRvclRocmVzaG9sZDogbnVtYmVyO1xuICAgIG1pblNwcml0ZVNpemU6IG51bWJlcjtcbiAgICBwYWQ6IG51bWJlcjtcbiAgICBub05vcm1hbGl6ZTogYm9vbGVhbjtcbiAgfTtcbiAgc2hlZXRQcmV2aWV3OiB7IHRpbGVDb3VudDogbnVtYmVyOyB0aWxlV2lkdGg6IG51bWJlcjsgdGlsZUhlaWdodDogbnVtYmVyOyBjb2xzOiBudW1iZXI7IHJvd3M6IG51bWJlciB9IHwgbnVsbDtcbiAgc2hlZXRQcm9jZXNzaW5nOiBib29sZWFuO1xuICAvLyBHSUYgYW5pbWF0aW9uIHN0YXRlXG4gIGdpZk1vZGU6ICdyb3cnIHwgJ2FsbCc7XG4gIGdpZlJvdzogbnVtYmVyO1xuICBnaWZGcHM6IG51bWJlcjtcbiAgZ2lmUHJldmlld1VybDogc3RyaW5nIHwgbnVsbDtcbiAgZ2lmR2VuZXJhdGluZzogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGU6IEFwcFN0YXRlID0ge1xuICBhY3RpdmVUYWI6ICdwcmV2aWV3JyxcbiAgaW1hZ2VMb2FkZWQ6IGZhbHNlLFxuICBpbWFnZVBhdGg6IG51bGwsXG4gIGltYWdlSW5mbzogbnVsbCxcbiAgc2V0dGluZ3NGb2N1c0luZGV4OiAwLFxuICBwcm9jZXNzaW5nOiBmYWxzZSxcbiAgcGFsZXR0ZXM6IFtdLFxuICBwYWxldHRlSW5kZXg6IDAsXG4gIGNvbmZpZzoge1xuICAgIGdyaWRTaXplOiBudWxsLFxuICAgIGdyaWRQaGFzZVg6IG51bGwsXG4gICAgZ3JpZFBoYXNlWTogbnVsbCxcbiAgICBtYXhHcmlkQ2FuZGlkYXRlOiAzMixcbiAgICBub0dyaWREZXRlY3Q6IGZhbHNlLFxuICAgIGRvd25zY2FsZU1vZGU6ICdzbmFwJyxcbiAgICBhYVRocmVzaG9sZDogbnVsbCxcbiAgICBwYWxldHRlTmFtZTogbnVsbCxcbiAgICBhdXRvQ29sb3JzOiBudWxsLFxuICAgIGxvc3BlY1NsdWc6IG51bGwsXG4gICAgY3VzdG9tUGFsZXR0ZTogbnVsbCxcbiAgICBub1F1YW50aXplOiBmYWxzZSxcbiAgICByZW1vdmVCZzogZmFsc2UsXG4gICAgYmdDb2xvcjogbnVsbCxcbiAgICBib3JkZXJUaHJlc2hvbGQ6IG51bGwsXG4gICAgYmdUb2xlcmFuY2U6IDAuMDUsXG4gICAgZmxvb2RGaWxsOiB0cnVlLFxuICAgIG91dHB1dFNjYWxlOiBudWxsLFxuICAgIG91dHB1dFdpZHRoOiBudWxsLFxuICAgIG91dHB1dEhlaWdodDogbnVsbCxcbiAgfSxcbiAgbG9zcGVjUmVzdWx0OiBudWxsLFxuICBsb3NwZWNFcnJvcjogbnVsbCxcbiAgbG9zcGVjTG9hZGluZzogZmFsc2UsXG4gIHBhbGV0dGVDb2xvcnM6IG51bGwsXG4gIHNob3dBbGxIZWxwOiBmYWxzZSxcbiAgbGFzdFByb2Nlc3NUaW1lOiBudWxsLFxuICAvLyBCYXRjaFxuICBiYXRjaEZpbGVzOiBbXSxcbiAgYmF0Y2hPdXRwdXREaXI6IG51bGwsXG4gIGJhdGNoUnVubmluZzogZmFsc2UsXG4gIGJhdGNoUHJvZ3Jlc3M6IG51bGwsXG4gIGJhdGNoUmVzdWx0OiBudWxsLFxuICAvLyBTaGVldFxuICBzaGVldE1vZGU6ICdhdXRvJyxcbiAgc2hlZXRDb25maWc6IHtcbiAgICB0aWxlV2lkdGg6IG51bGwsXG4gICAgdGlsZUhlaWdodDogbnVsbCxcbiAgICBzcGFjaW5nOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBzZXBhcmF0b3JUaHJlc2hvbGQ6IDAuOTAsXG4gICAgbWluU3ByaXRlU2l6ZTogOCxcbiAgICBwYWQ6IDAsXG4gICAgbm9Ob3JtYWxpemU6IGZhbHNlLFxuICB9LFxuICBzaGVldFByZXZpZXc6IG51bGwsXG4gIHNoZWV0UHJvY2Vzc2luZzogZmFsc2UsXG4gIC8vIEdJRlxuICBnaWZNb2RlOiAncm93JyxcbiAgZ2lmUm93OiAwLFxuICBnaWZGcHM6IDEwLFxuICBnaWZQcmV2aWV3VXJsOiBudWxsLFxuICBnaWZHZW5lcmF0aW5nOiBmYWxzZSxcbn07XG5cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBBcHBDb25maWcgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHN0YXRlLmNvbmZpZykpO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNldHRpbmdzIGRlZmluaXRpb25zXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgRE9XTlNDQUxFX01PREVTID0gWydzbmFwJywgJ2NlbnRlci13ZWlnaHRlZCcsICdtYWpvcml0eS12b3RlJywgJ2NlbnRlci1waXhlbCddO1xuXG5pbnRlcmZhY2UgU2V0dGluZ1NlY3Rpb24ge1xuICBzZWN0aW9uOiBzdHJpbmc7XG4gIGtleT86IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIFNldHRpbmdSb3cge1xuICBzZWN0aW9uPzogdW5kZWZpbmVkO1xuICBrZXk6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdmFsdWU6IHN0cmluZztcbiAgaGVscDogc3RyaW5nO1xuICBjaGFuZ2VkOiBib29sZWFuO1xufVxuXG50eXBlIFNldHRpbmdFbnRyeSA9IFNldHRpbmdTZWN0aW9uIHwgU2V0dGluZ1JvdztcblxuZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKTogU2V0dGluZ0VudHJ5W10ge1xuICBjb25zdCBjID0gc3RhdGUuY29uZmlnO1xuICByZXR1cm4gW1xuICAgIHsgc2VjdGlvbjogJ0dyaWQgRGV0ZWN0aW9uJyB9LFxuICAgIHtcbiAgICAgIGtleTogJ2dyaWRTaXplJywgbGFiZWw6ICdHcmlkIFNpemUnLFxuICAgICAgdmFsdWU6IGMuZ3JpZFNpemUgPT09IG51bGwgPyAnYXV0bycgOiBTdHJpbmcoYy5ncmlkU2l6ZSksXG4gICAgICBoZWxwOiAnSG93IG1hbnkgc2NyZWVuIHBpeGVscyBtYWtlIHVwIG9uZSBcImxvZ2ljYWxcIiBwaXhlbCBpbiB5b3VyIGFydC4gQXV0by1kZXRlY3Rpb24gd29ya3Mgd2VsbCBmb3IgbW9zdCBpbWFnZXMuIE92ZXJyaWRlIGlmIHRoZSBncmlkIGxvb2tzIHdyb25nLicsXG4gICAgICBjaGFuZ2VkOiBjLmdyaWRTaXplICE9PSBudWxsLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAnZ3JpZFBoYXNlWCcsIGxhYmVsOiAnUGhhc2UgWCcsXG4gICAgICB2YWx1ZTogYy5ncmlkUGhhc2VYID09PSBudWxsID8gJ2F1dG8nIDogU3RyaW5nKGMuZ3JpZFBoYXNlWCksXG4gICAgICBoZWxwOiAnT3ZlcnJpZGUgdGhlIFggb2Zmc2V0IG9mIHRoZSBncmlkIGFsaWdubWVudC4gVXN1YWxseSBhdXRvLWRldGVjdGVkLicsXG4gICAgICBjaGFuZ2VkOiBjLmdyaWRQaGFzZVggIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdncmlkUGhhc2VZJywgbGFiZWw6ICdQaGFzZSBZJyxcbiAgICAgIHZhbHVlOiBjLmdyaWRQaGFzZVkgPT09IG51bGwgPyAnYXV0bycgOiBTdHJpbmcoYy5ncmlkUGhhc2VZKSxcbiAgICAgIGhlbHA6ICdPdmVycmlkZSB0aGUgWSBvZmZzZXQgb2YgdGhlIGdyaWQgYWxpZ25tZW50LiBVc3VhbGx5IGF1dG8tZGV0ZWN0ZWQuJyxcbiAgICAgIGNoYW5nZWQ6IGMuZ3JpZFBoYXNlWSAhPT0gbnVsbCxcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ25vR3JpZERldGVjdCcsIGxhYmVsOiAnU2tpcCBHcmlkJyxcbiAgICAgIHZhbHVlOiBjLm5vR3JpZERldGVjdCA/ICdvbicgOiAnb2ZmJyxcbiAgICAgIGhlbHA6ICdTa2lwIGdyaWQgZGV0ZWN0aW9uIGVudGlyZWx5LiBVc2VmdWwgaWYgeW91ciBpbWFnZSBpcyBhbHJlYWR5IGF0IGxvZ2ljYWwgcmVzb2x1dGlvbi4nLFxuICAgICAgY2hhbmdlZDogYy5ub0dyaWREZXRlY3QsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdtYXhHcmlkQ2FuZGlkYXRlJywgbGFiZWw6ICdNYXggR3JpZCcsXG4gICAgICB2YWx1ZTogU3RyaW5nKGMubWF4R3JpZENhbmRpZGF0ZSksXG4gICAgICBoZWxwOiAnTWF4aW11bSBncmlkIHNpemUgdG8gdGVzdCBkdXJpbmcgYXV0by1kZXRlY3Rpb24gKGRlZmF1bHQ6IDMyKS4nLFxuICAgICAgY2hhbmdlZDogYy5tYXhHcmlkQ2FuZGlkYXRlICE9PSAzMixcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ2Rvd25zY2FsZU1vZGUnLCBsYWJlbDogJ01vZGUnLFxuICAgICAgdmFsdWU6IGMuZG93bnNjYWxlTW9kZSxcbiAgICAgIGhlbHA6ICdIb3cgdG8gY29tYmluZSBwaXhlbHMgaW4gZWFjaCBncmlkIGNlbGwuIFwic25hcFwiIGNsZWFucyBpbi1wbGFjZSBhdCBvcmlnaW5hbCByZXNvbHV0aW9uLiBPdGhlcnMgcmVkdWNlIHRvIGxvZ2ljYWwgcGl4ZWwgcmVzb2x1dGlvbi4nLFxuICAgICAgY2hhbmdlZDogYy5kb3duc2NhbGVNb2RlICE9PSAnc25hcCcsXG4gICAgfSxcbiAgICB7IHNlY3Rpb246ICdBbnRpLUFsaWFzaW5nJyB9LFxuICAgIHtcbiAgICAgIGtleTogJ2FhVGhyZXNob2xkJywgbGFiZWw6ICdBQSBSZW1vdmFsJyxcbiAgICAgIHZhbHVlOiBjLmFhVGhyZXNob2xkID09PSBudWxsID8gJ29mZicgOiBjLmFhVGhyZXNob2xkLnRvRml4ZWQoMiksXG4gICAgICBoZWxwOiAnUmVtb3ZlcyBzb2Z0IGJsZW5kaW5nIGJldHdlZW4gY29sb3JzIGFkZGVkIGJ5IEFJIGdlbmVyYXRvcnMuIExvd2VyIHZhbHVlcyBhcmUgbW9yZSBhZ2dyZXNzaXZlLiBUcnkgMC4zMFxcdTIwMTMwLjUwIGZvciBtb3N0IGltYWdlcy4nLFxuICAgICAgY2hhbmdlZDogYy5hYVRocmVzaG9sZCAhPT0gbnVsbCxcbiAgICB9LFxuICAgIHsgc2VjdGlvbjogJ0NvbG9yIFBhbGV0dGUnIH0sXG4gICAge1xuICAgICAga2V5OiAncGFsZXR0ZU5hbWUnLCBsYWJlbDogJ1BhbGV0dGUnLFxuICAgICAgdmFsdWU6IGMucGFsZXR0ZU5hbWUgPT09IG51bGwgPyAnbm9uZScgOiBjLnBhbGV0dGVOYW1lLFxuICAgICAgaGVscDogJ1NuYXAgYWxsIGNvbG9ycyB0byBhIGNsYXNzaWMgcGl4ZWwgYXJ0IHBhbGV0dGUuIE11dHVhbGx5IGV4Y2x1c2l2ZSB3aXRoIExvc3BlYyBhbmQgQXV0byBDb2xvcnMuJyxcbiAgICAgIGNoYW5nZWQ6IGMucGFsZXR0ZU5hbWUgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdsb3NwZWNTbHVnJywgbGFiZWw6ICdMb3NwZWMnLFxuICAgICAgdmFsdWU6IGMubG9zcGVjU2x1ZyA9PT0gbnVsbCA/ICdub25lJyA6IGMubG9zcGVjU2x1ZyxcbiAgICAgIGhlbHA6ICdMb2FkIGFueSBwYWxldHRlIGZyb20gbG9zcGVjLmNvbSBieSBzbHVnIChlLmcuIFwicGljby04XCIsIFwiZW5kZXNnYS0zMlwiKS4gUHJlc3MgRW50ZXIgdG8gdHlwZSBhIHNsdWcgYW5kIGZldGNoIGl0LicsXG4gICAgICBjaGFuZ2VkOiBjLmxvc3BlY1NsdWcgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdhdXRvQ29sb3JzJywgbGFiZWw6ICdBdXRvIENvbG9ycycsXG4gICAgICB2YWx1ZTogYy5hdXRvQ29sb3JzID09PSBudWxsID8gJ29mZicgOiBTdHJpbmcoYy5hdXRvQ29sb3JzKSxcbiAgICAgIGhlbHA6ICdBdXRvLWV4dHJhY3QgdGhlIGJlc3QgTiBjb2xvcnMgZnJvbSB5b3VyIGltYWdlIHVzaW5nIGstbWVhbnMgY2x1c3RlcmluZyBpbiBPS0xBQiBjb2xvciBzcGFjZS4nLFxuICAgICAgY2hhbmdlZDogYy5hdXRvQ29sb3JzICE9PSBudWxsLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAncGFsZXR0ZUZpbGUnLCBsYWJlbDogJ0xvYWQgLmhleCcsXG4gICAgICB2YWx1ZTogYy5jdXN0b21QYWxldHRlICYmICFjLmxvc3BlY1NsdWcgPyBgJHtjLmN1c3RvbVBhbGV0dGUubGVuZ3RofSBjb2xvcnNgIDogJ25vbmUnLFxuICAgICAgaGVscDogJ0xvYWQgYSBwYWxldHRlIGZyb20gYSAuaGV4IGZpbGUgKG9uZSBoZXggY29sb3IgcGVyIGxpbmUpLiBPdmVycmlkZXMgcGFsZXR0ZSBhbmQgYXV0byBjb2xvcnMuJyxcbiAgICAgIGNoYW5nZWQ6IGMuY3VzdG9tUGFsZXR0ZSAhPT0gbnVsbCAmJiBjLmxvc3BlY1NsdWcgPT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdub1F1YW50aXplJywgbGFiZWw6ICdTa2lwIFF1YW50aXplJyxcbiAgICAgIHZhbHVlOiBjLm5vUXVhbnRpemUgPyAnb24nIDogJ29mZicsXG4gICAgICBoZWxwOiAnU2tpcCBjb2xvciBxdWFudGl6YXRpb24gZW50aXJlbHkuIFVzZWZ1bCBpZiB5b3Ugb25seSB3YW50IGdyaWQgc25hcHBpbmcgYW5kIEFBIHJlbW92YWwgd2l0aG91dCBwYWxldHRlIGNoYW5nZXMuJyxcbiAgICAgIGNoYW5nZWQ6IGMubm9RdWFudGl6ZSxcbiAgICB9LFxuICAgIHsgc2VjdGlvbjogJ0JhY2tncm91bmQnIH0sXG4gICAge1xuICAgICAga2V5OiAncmVtb3ZlQmcnLCBsYWJlbDogJ1JlbW92ZSBCRycsXG4gICAgICB2YWx1ZTogYy5yZW1vdmVCZyA/ICdvbicgOiAnb2ZmJyxcbiAgICAgIGhlbHA6ICdEZXRlY3QgYW5kIG1ha2UgdGhlIGJhY2tncm91bmQgdHJhbnNwYXJlbnQuIFRoZSBkb21pbmFudCBib3JkZXIgY29sb3IgaXMgdHJlYXRlZCBhcyBiYWNrZ3JvdW5kLicsXG4gICAgICBjaGFuZ2VkOiBjLnJlbW92ZUJnLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAnYmdDb2xvcicsIGxhYmVsOiAnQkcgQ29sb3InLFxuICAgICAgdmFsdWU6IGMuYmdDb2xvciA9PT0gbnVsbCA/ICdhdXRvJyA6IGMuYmdDb2xvcixcbiAgICAgIGhlbHA6ICdFeHBsaWNpdCBiYWNrZ3JvdW5kIGNvbG9yIGFzIGhleCAoZS5nLiBcIiNGRjAwRkZcIikuIElmIGF1dG8sIGRldGVjdHMgZnJvbSBib3JkZXIgcGl4ZWxzLicsXG4gICAgICBjaGFuZ2VkOiBjLmJnQ29sb3IgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdib3JkZXJUaHJlc2hvbGQnLCBsYWJlbDogJ0JvcmRlciBUaHJlc2gnLFxuICAgICAgdmFsdWU6IGMuYm9yZGVyVGhyZXNob2xkID09PSBudWxsID8gJzAuNDAnIDogYy5ib3JkZXJUaHJlc2hvbGQudG9GaXhlZCgyKSxcbiAgICAgIGhlbHA6ICdGcmFjdGlvbiBvZiBib3JkZXIgcGl4ZWxzIHRoYXQgbXVzdCBtYXRjaCBmb3IgYXV0by1kZXRlY3Rpb24gKDAuMFxcdTIwMTMxLjAsIGRlZmF1bHQ6IDAuNDApLicsXG4gICAgICBjaGFuZ2VkOiBjLmJvcmRlclRocmVzaG9sZCAhPT0gbnVsbCxcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ2JnVG9sZXJhbmNlJywgbGFiZWw6ICdCRyBUb2xlcmFuY2UnLFxuICAgICAgdmFsdWU6IGMuYmdUb2xlcmFuY2UudG9GaXhlZCgyKSxcbiAgICAgIGhlbHA6ICdIb3cgZGlmZmVyZW50IGEgcGl4ZWwgY2FuIGJlIGZyb20gdGhlIGJhY2tncm91bmQgY29sb3IgYW5kIHN0aWxsIGNvdW50IGFzIGJhY2tncm91bmQuIEhpZ2hlciA9IG1vcmUgYWdncmVzc2l2ZS4nLFxuICAgICAgY2hhbmdlZDogYy5iZ1RvbGVyYW5jZSAhPT0gMC4wNSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGtleTogJ2Zsb29kRmlsbCcsIGxhYmVsOiAnRmxvb2QgRmlsbCcsXG4gICAgICB2YWx1ZTogYy5mbG9vZEZpbGwgPyAnb24nIDogJ29mZicsXG4gICAgICBoZWxwOiAnT246IG9ubHkgcmVtb3ZlIGNvbm5lY3RlZCBiYWNrZ3JvdW5kIGZyb20gZWRnZXMuIE9mZjogcmVtb3ZlIG1hdGNoaW5nIGNvbG9yIGV2ZXJ5d2hlcmUuJyxcbiAgICAgIGNoYW5nZWQ6ICFjLmZsb29kRmlsbCxcbiAgICB9LFxuICAgIHsgc2VjdGlvbjogJ091dHB1dCcgfSxcbiAgICB7XG4gICAgICBrZXk6ICdvdXRwdXRTY2FsZScsIGxhYmVsOiAnU2NhbGUnLFxuICAgICAgdmFsdWU6IGMub3V0cHV0U2NhbGUgPT09IG51bGwgPyAnb2ZmJyA6IGMub3V0cHV0U2NhbGUgKyAneCcsXG4gICAgICBoZWxwOiAnU2NhbGUgdGhlIG91dHB1dCBieSBhbiBpbnRlZ2VyIG11bHRpcGxpZXIgKDJ4LCAzeCwgZXRjKS4gR3JlYXQgZm9yIHVwc2NhbGluZyBzcHJpdGVzIGZvciBnYW1lIGVuZ2luZXMuJyxcbiAgICAgIGNoYW5nZWQ6IGMub3V0cHV0U2NhbGUgIT09IG51bGwsXG4gICAgfSxcbiAgICB7XG4gICAgICBrZXk6ICdvdXRwdXRXaWR0aCcsIGxhYmVsOiAnV2lkdGgnLFxuICAgICAgdmFsdWU6IGMub3V0cHV0V2lkdGggPT09IG51bGwgPyAnYXV0bycgOiBTdHJpbmcoYy5vdXRwdXRXaWR0aCksXG4gICAgICBoZWxwOiAnRXhwbGljaXQgb3V0cHV0IHdpZHRoIGluIHBpeGVscy4gT3ZlcnJpZGVzIHNjYWxlLicsXG4gICAgICBjaGFuZ2VkOiBjLm91dHB1dFdpZHRoICE9PSBudWxsLFxuICAgIH0sXG4gICAge1xuICAgICAga2V5OiAnb3V0cHV0SGVpZ2h0JywgbGFiZWw6ICdIZWlnaHQnLFxuICAgICAgdmFsdWU6IGMub3V0cHV0SGVpZ2h0ID09PSBudWxsID8gJ2F1dG8nIDogU3RyaW5nKGMub3V0cHV0SGVpZ2h0KSxcbiAgICAgIGhlbHA6ICdFeHBsaWNpdCBvdXRwdXQgaGVpZ2h0IGluIHBpeGVscy4gT3ZlcnJpZGVzIHNjYWxlLicsXG4gICAgICBjaGFuZ2VkOiBjLm91dHB1dEhlaWdodCAhPT0gbnVsbCxcbiAgICB9LFxuICBdO1xufVxuXG5mdW5jdGlvbiBnZXRTZXR0aW5nUm93cygpOiBTZXR0aW5nUm93W10ge1xuICByZXR1cm4gZ2V0U2V0dGluZ3MoKS5maWx0ZXIoKHMpOiBzIGlzIFNldHRpbmdSb3cgPT4gIXMuc2VjdGlvbik7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gU2V0dGluZyBhZGp1c3RtZW50IChhcnJvdyBrZXlzKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGFkanVzdFNldHRpbmcoa2V5OiBzdHJpbmcsIGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnZ3JpZFNpemUnOlxuICAgICAgaWYgKGMuZ3JpZFNpemUgPT09IG51bGwpIHtcbiAgICAgICAgYy5ncmlkU2l6ZSA9IHN0YXRlLmltYWdlSW5mbz8uZ3JpZFNpemUgfHwgNDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuZ3JpZFNpemUgPSBNYXRoLm1heCgxLCBjLmdyaWRTaXplICsgZGlyZWN0aW9uKTtcbiAgICAgICAgaWYgKGMuZ3JpZFNpemUgPT09IDEgJiYgZGlyZWN0aW9uIDwgMCkgYy5ncmlkU2l6ZSA9IG51bGw7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdncmlkUGhhc2VYJzpcbiAgICAgIGlmIChjLmdyaWRQaGFzZVggPT09IG51bGwpIHtcbiAgICAgICAgYy5ncmlkUGhhc2VYID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuZ3JpZFBoYXNlWCA9IE1hdGgubWF4KDAsIGMuZ3JpZFBoYXNlWCArIGRpcmVjdGlvbik7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdncmlkUGhhc2VZJzpcbiAgICAgIGlmIChjLmdyaWRQaGFzZVkgPT09IG51bGwpIHtcbiAgICAgICAgYy5ncmlkUGhhc2VZID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuZ3JpZFBoYXNlWSA9IE1hdGgubWF4KDAsIGMuZ3JpZFBoYXNlWSArIGRpcmVjdGlvbik7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdtYXhHcmlkQ2FuZGlkYXRlJzpcbiAgICAgIGMubWF4R3JpZENhbmRpZGF0ZSA9IE1hdGgubWF4KDIsIE1hdGgubWluKDY0LCBjLm1heEdyaWRDYW5kaWRhdGUgKyBkaXJlY3Rpb24gKiA0KSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdub0dyaWREZXRlY3QnOlxuICAgICAgYy5ub0dyaWREZXRlY3QgPSAhYy5ub0dyaWREZXRlY3Q7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdkb3duc2NhbGVNb2RlJzoge1xuICAgICAgbGV0IGlkeCA9IERPV05TQ0FMRV9NT0RFUy5pbmRleE9mKGMuZG93bnNjYWxlTW9kZSk7XG4gICAgICBpZHggPSAoaWR4ICsgZGlyZWN0aW9uICsgRE9XTlNDQUxFX01PREVTLmxlbmd0aCkgJSBET1dOU0NBTEVfTU9ERVMubGVuZ3RoO1xuICAgICAgYy5kb3duc2NhbGVNb2RlID0gRE9XTlNDQUxFX01PREVTW2lkeF07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnYWFUaHJlc2hvbGQnOlxuICAgICAgaWYgKGMuYWFUaHJlc2hvbGQgPT09IG51bGwpIHtcbiAgICAgICAgYy5hYVRocmVzaG9sZCA9IDAuNTA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjLmFhVGhyZXNob2xkID0gTWF0aC5yb3VuZCgoYy5hYVRocmVzaG9sZCArIGRpcmVjdGlvbiAqIDAuMDUpICogMTAwKSAvIDEwMDtcbiAgICAgICAgaWYgKGMuYWFUaHJlc2hvbGQgPD0gMCkgYy5hYVRocmVzaG9sZCA9IG51bGw7XG4gICAgICAgIGVsc2UgaWYgKGMuYWFUaHJlc2hvbGQgPiAxLjApIGMuYWFUaHJlc2hvbGQgPSAxLjA7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdwYWxldHRlTmFtZSc6IHtcbiAgICAgIGNvbnN0IG5hbWVzOiAoc3RyaW5nIHwgbnVsbClbXSA9IFtudWxsLCAuLi5zdGF0ZS5wYWxldHRlcy5tYXAocCA9PiBwLnNsdWcpXTtcbiAgICAgIGxldCBpZHggPSBuYW1lcy5pbmRleE9mKGMucGFsZXR0ZU5hbWUpO1xuICAgICAgaWR4ID0gKGlkeCArIGRpcmVjdGlvbiArIG5hbWVzLmxlbmd0aCkgJSBuYW1lcy5sZW5ndGg7XG4gICAgICBjLnBhbGV0dGVOYW1lID0gbmFtZXNbaWR4XTtcbiAgICAgIGlmIChjLnBhbGV0dGVOYW1lICE9PSBudWxsKSB7XG4gICAgICAgIGMuYXV0b0NvbG9ycyA9IG51bGw7XG4gICAgICAgIGMubG9zcGVjU2x1ZyA9IG51bGw7XG4gICAgICAgIGMuY3VzdG9tUGFsZXR0ZSA9IG51bGw7XG4gICAgICAgIHN0YXRlLmxvc3BlY1Jlc3VsdCA9IG51bGw7XG4gICAgICAgIGZldGNoUGFsZXR0ZUNvbG9ycyhjLnBhbGV0dGVOYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ2F1dG9Db2xvcnMnOlxuICAgICAgaWYgKGMuYXV0b0NvbG9ycyA9PT0gbnVsbCkge1xuICAgICAgICBjLmF1dG9Db2xvcnMgPSAxNjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMuYXV0b0NvbG9ycyA9IE1hdGgubWF4KDIsIGMuYXV0b0NvbG9ycyArIGRpcmVjdGlvbiAqIDIpO1xuICAgICAgICBpZiAoYy5hdXRvQ29sb3JzIDw9IDIgJiYgZGlyZWN0aW9uIDwgMCkgYy5hdXRvQ29sb3JzID0gbnVsbDtcbiAgICAgICAgZWxzZSBpZiAoYy5hdXRvQ29sb3JzID4gMjU2KSBjLmF1dG9Db2xvcnMgPSAyNTY7XG4gICAgICB9XG4gICAgICBpZiAoYy5hdXRvQ29sb3JzICE9PSBudWxsKSB7XG4gICAgICAgIGMucGFsZXR0ZU5hbWUgPSBudWxsO1xuICAgICAgICBjLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgICBjLmN1c3RvbVBhbGV0dGUgPSBudWxsO1xuICAgICAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gbnVsbDtcbiAgICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3JlbW92ZUJnJzpcbiAgICAgIGMucmVtb3ZlQmcgPSAhYy5yZW1vdmVCZztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2JvcmRlclRocmVzaG9sZCc6XG4gICAgICBpZiAoYy5ib3JkZXJUaHJlc2hvbGQgPT09IG51bGwpIHtcbiAgICAgICAgYy5ib3JkZXJUaHJlc2hvbGQgPSAwLjQwO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYy5ib3JkZXJUaHJlc2hvbGQgPSBNYXRoLnJvdW5kKChjLmJvcmRlclRocmVzaG9sZCArIGRpcmVjdGlvbiAqIDAuMDUpICogMTAwKSAvIDEwMDtcbiAgICAgICAgaWYgKGMuYm9yZGVyVGhyZXNob2xkIDw9IDApIGMuYm9yZGVyVGhyZXNob2xkID0gbnVsbDtcbiAgICAgICAgZWxzZSBpZiAoYy5ib3JkZXJUaHJlc2hvbGQgPiAxLjApIGMuYm9yZGVyVGhyZXNob2xkID0gMS4wO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYmdUb2xlcmFuY2UnOlxuICAgICAgYy5iZ1RvbGVyYW5jZSA9IE1hdGgucm91bmQoKGMuYmdUb2xlcmFuY2UgKyBkaXJlY3Rpb24gKiAwLjAxKSAqIDEwMCkgLyAxMDA7XG4gICAgICBjLmJnVG9sZXJhbmNlID0gTWF0aC5tYXgoMC4wMSwgTWF0aC5taW4oMC41MCwgYy5iZ1RvbGVyYW5jZSkpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZmxvb2RGaWxsJzpcbiAgICAgIGMuZmxvb2RGaWxsID0gIWMuZmxvb2RGaWxsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb3V0cHV0U2NhbGUnOlxuICAgICAgaWYgKGMub3V0cHV0U2NhbGUgPT09IG51bGwpIHtcbiAgICAgICAgYy5vdXRwdXRTY2FsZSA9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjLm91dHB1dFNjYWxlID0gYy5vdXRwdXRTY2FsZSArIGRpcmVjdGlvbjtcbiAgICAgICAgaWYgKGMub3V0cHV0U2NhbGUgPCAyKSBjLm91dHB1dFNjYWxlID0gbnVsbDtcbiAgICAgICAgZWxzZSBpZiAoYy5vdXRwdXRTY2FsZSA+IDE2KSBjLm91dHB1dFNjYWxlID0gMTY7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvdXRwdXRXaWR0aCc6XG4gICAgICBpZiAoYy5vdXRwdXRXaWR0aCA9PT0gbnVsbCkge1xuICAgICAgICBjLm91dHB1dFdpZHRoID0gc3RhdGUuaW1hZ2VJbmZvPy53aWR0aCB8fCA2NDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMub3V0cHV0V2lkdGggPSBNYXRoLm1heCgxLCBjLm91dHB1dFdpZHRoICsgZGlyZWN0aW9uICogOCk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvdXRwdXRIZWlnaHQnOlxuICAgICAgaWYgKGMub3V0cHV0SGVpZ2h0ID09PSBudWxsKSB7XG4gICAgICAgIGMub3V0cHV0SGVpZ2h0ID0gc3RhdGUuaW1hZ2VJbmZvPy5oZWlnaHQgfHwgNjQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjLm91dHB1dEhlaWdodCA9IE1hdGgubWF4KDEsIGMub3V0cHV0SGVpZ2h0ICsgZGlyZWN0aW9uICogOCk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFBhbGV0dGUgY29sb3JzIGZldGNoaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hQYWxldHRlQ29sb3JzKHNsdWc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvbG9ycyA9IGF3YWl0IGludm9rZTxzdHJpbmdbXT4oJ2dldF9wYWxldHRlX2NvbG9ycycsIHsgc2x1ZyB9KTtcbiAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gY29sb3JzO1xuICAgIHJlbmRlclNldHRpbmdzKCk7XG4gIH0gY2F0Y2gge1xuICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoTG9zcGVjKHNsdWc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBzdGF0ZS5sb3NwZWNMb2FkaW5nID0gdHJ1ZTtcbiAgc3RhdGUubG9zcGVjRXJyb3IgPSBudWxsO1xuICByZW5kZXJTZXR0aW5ncygpO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZTxMb3NwZWNSZXN1bHQ+KCdmZXRjaF9sb3NwZWMnLCB7IHNsdWcgfSk7XG4gICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gcmVzdWx0O1xuICAgIHN0YXRlLmNvbmZpZy5sb3NwZWNTbHVnID0gc2x1ZztcbiAgICBzdGF0ZS5jb25maWcuY3VzdG9tUGFsZXR0ZSA9IHJlc3VsdC5jb2xvcnM7XG4gICAgc3RhdGUuY29uZmlnLnBhbGV0dGVOYW1lID0gbnVsbDtcbiAgICBzdGF0ZS5jb25maWcuYXV0b0NvbG9ycyA9IG51bGw7XG4gICAgc3RhdGUucGFsZXR0ZUNvbG9ycyA9IHJlc3VsdC5jb2xvcnM7XG4gICAgc3RhdGUubG9zcGVjTG9hZGluZyA9IGZhbHNlO1xuICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgYXV0b1Byb2Nlc3MoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN0YXRlLmxvc3BlY0Vycm9yID0gU3RyaW5nKGUpO1xuICAgIHN0YXRlLmxvc3BlY0xvYWRpbmcgPSBmYWxzZTtcbiAgICByZW5kZXJTZXR0aW5ncygpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQYWxldHRlRmlsZURpYWxvZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcGVuRGlhbG9nKHtcbiAgICAgIG11bHRpcGxlOiBmYWxzZSxcbiAgICAgIGZpbHRlcnM6IFt7XG4gICAgICAgIG5hbWU6ICdQYWxldHRlIEZpbGVzJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydoZXgnLCAndHh0J10sXG4gICAgICB9XSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBjb25zdCBjb2xvcnMgPSBhd2FpdCBpbnZva2U8c3RyaW5nW10+KCdsb2FkX3BhbGV0dGVfZmlsZScsIHsgcGF0aDogcmVzdWx0IH0pO1xuICAgICAgc3RhdGUuY29uZmlnLmN1c3RvbVBhbGV0dGUgPSBjb2xvcnM7XG4gICAgICBzdGF0ZS5jb25maWcucGFsZXR0ZU5hbWUgPSBudWxsO1xuICAgICAgc3RhdGUuY29uZmlnLmF1dG9Db2xvcnMgPSBudWxsO1xuICAgICAgc3RhdGUuY29uZmlnLmxvc3BlY1NsdWcgPSBudWxsO1xuICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBjb2xvcnM7XG4gICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgYXV0b1Byb2Nlc3MoKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yIGxvYWRpbmcgcGFsZXR0ZTogJyArIGUsICdlcnJvcicpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVUkgcmVuZGVyaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gc2V0U3RhdHVzKG1zZzogc3RyaW5nLCB0eXBlOiBzdHJpbmcgPSAnJyk6IHZvaWQge1xuICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdGF0dXMtbXNnJykhO1xuICBlbC50ZXh0Q29udGVudCA9IG1zZztcbiAgZWwuY2xhc3NOYW1lID0gJ3N0YXR1cy1tc2cnICsgKHR5cGUgPyAnICcgKyB0eXBlIDogJycpO1xuICAvLyBTaG93L2hpZGUgc3RhdHVzIGJhciBzcGlubmVyIGJhc2VkIG9uIHByb2Nlc3Npbmcgc3RhdGVcbiAgY29uc3Qgc3Bpbm5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdGF0dXMtc3Bpbm5lcicpITtcbiAgaWYgKHR5cGUgPT09ICdwcm9jZXNzaW5nJykge1xuICAgIHNwaW5uZXIuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gIH0gZWxzZSB7XG4gICAgc3Bpbm5lci5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93V2VsY29tZUxvYWRpbmcoKTogdm9pZCB7XG4gIGNvbnN0IHdlbGNvbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnd2VsY29tZScpITtcbiAgY29uc3QgbG9hZGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3ZWxjb21lLWxvYWRpbmcnKSE7XG4gIHdlbGNvbWUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgbG9hZGluZy5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xufVxuXG5mdW5jdGlvbiBoaWRlV2VsY29tZUxvYWRpbmcoKTogdm9pZCB7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3ZWxjb21lLWxvYWRpbmcnKSEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbn1cblxuZnVuY3Rpb24gc3dpdGNoVGFiKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICBzdGF0ZS5hY3RpdmVUYWIgPSBuYW1lO1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGFiJykuZm9yRWFjaCh0ID0+IHtcbiAgICAodCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgKHQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQudGFiID09PSBuYW1lKTtcbiAgfSk7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItcGFuZWwnKS5mb3JFYWNoKHAgPT4ge1xuICAgIChwIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBwLmlkID09PSAncGFuZWwtJyArIG5hbWUpO1xuICB9KTtcbiAgLy8gUmUtcmVuZGVyIGR5bmFtaWMgdGFicyB0byByZWZsZWN0IGxhdGVzdCBzdGF0ZVxuICBpZiAobmFtZSA9PT0gJ2JhdGNoJykgcmVuZGVyQmF0Y2goKTtcbiAgaWYgKG5hbWUgPT09ICdzaGVldCcpIHJlbmRlclNoZWV0KCk7XG59XG5cbi8vIFNldHRpbmdzIHRoYXQgYWx3YXlzIHJlbmRlciBhcyA8c2VsZWN0PiBkcm9wZG93bnNcbmNvbnN0IFNFTEVDVF9TRVRUSU5HUyA9IFsnZG93bnNjYWxlTW9kZScsICdwYWxldHRlTmFtZSddO1xuLy8gU2V0dGluZ3MgdGhhdCBhcmUgYm9vbGVhbiB0b2dnbGVzXG5jb25zdCBCT09MRUFOX1NFVFRJTkdTID0gWydyZW1vdmVCZycsICdmbG9vZEZpbGwnLCAnbm9HcmlkRGV0ZWN0JywgJ25vUXVhbnRpemUnXTtcbi8vIFNldHRpbmdzIHRoYXQgcmVxdWlyZSBFbnRlci10by1lZGl0ICh0ZXh0L251bWVyaWMgaW5wdXQpXG5jb25zdCBJTlBVVF9TRVRUSU5HUyA9IFsnZ3JpZFNpemUnLCAnZ3JpZFBoYXNlWCcsICdncmlkUGhhc2VZJywgJ21heEdyaWRDYW5kaWRhdGUnLCAnYWFUaHJlc2hvbGQnLCAnYXV0b0NvbG9ycycsICdiZ0NvbG9yJywgJ2JvcmRlclRocmVzaG9sZCcsICdiZ1RvbGVyYW5jZScsICdsb3NwZWNTbHVnJywgJ291dHB1dFNjYWxlJywgJ291dHB1dFdpZHRoJywgJ291dHB1dEhlaWdodCddO1xuLy8gU2V0dGluZ3MgdGhhdCBvcGVuIGEgZmlsZSBkaWFsb2cgaW5zdGVhZCBvZiBlZGl0aW5nXG5jb25zdCBGSUxFX1NFVFRJTkdTID0gWydwYWxldHRlRmlsZSddO1xuLy8gTnVsbGFibGUgc2V0dGluZ3Mg4oCUIGNhbiBiZSB0dXJuZWQgb2ZmIChudWxsKSB3aXRoIGEgY2xlYXIgYnV0dG9uXG5jb25zdCBOVUxMQUJMRV9TRVRUSU5HUzogUmVjb3JkPHN0cmluZywgeyBvZmZMYWJlbDogc3RyaW5nOyBkZWZhdWx0VmFsdWU6ICgpID0+IHVua25vd24gfT4gPSB7XG4gIGdyaWRTaXplOiAgICAgICAgIHsgb2ZmTGFiZWw6ICdhdXRvJywgIGRlZmF1bHRWYWx1ZTogKCkgPT4gc3RhdGUuaW1hZ2VJbmZvPy5ncmlkU2l6ZSB8fCA0IH0sXG4gIGdyaWRQaGFzZVg6ICAgICAgIHsgb2ZmTGFiZWw6ICdhdXRvJywgIGRlZmF1bHRWYWx1ZTogKCkgPT4gMCB9LFxuICBncmlkUGhhc2VZOiAgICAgICB7IG9mZkxhYmVsOiAnYXV0bycsICBkZWZhdWx0VmFsdWU6ICgpID0+IDAgfSxcbiAgYWFUaHJlc2hvbGQ6ICAgICAgeyBvZmZMYWJlbDogJ29mZicsICAgZGVmYXVsdFZhbHVlOiAoKSA9PiAwLjUwIH0sXG4gIGF1dG9Db2xvcnM6ICAgICAgIHsgb2ZmTGFiZWw6ICdvZmYnLCAgIGRlZmF1bHRWYWx1ZTogKCkgPT4gMTYgfSxcbiAgbG9zcGVjU2x1ZzogICAgICAgeyBvZmZMYWJlbDogJ25vbmUnLCAgZGVmYXVsdFZhbHVlOiAoKSA9PiBudWxsIH0sIC8vIGxvc3BlYyBhbHdheXMgb3BlbnMgaW5wdXRcbiAgYmdDb2xvcjogICAgICAgICAgeyBvZmZMYWJlbDogJ2F1dG8nLCAgZGVmYXVsdFZhbHVlOiAoKSA9PiBudWxsIH0sIC8vIGJnQ29sb3Igb3BlbnMgaW5wdXRcbiAgYm9yZGVyVGhyZXNob2xkOiAgeyBvZmZMYWJlbDogJzAuNDAnLCAgZGVmYXVsdFZhbHVlOiAoKSA9PiAwLjQwIH0sXG4gIG91dHB1dFNjYWxlOiAgICAgIHsgb2ZmTGFiZWw6ICdvZmYnLCAgIGRlZmF1bHRWYWx1ZTogKCkgPT4gMiB9LFxuICBvdXRwdXRXaWR0aDogICAgICB7IG9mZkxhYmVsOiAnYXV0bycsICBkZWZhdWx0VmFsdWU6ICgpID0+IHN0YXRlLmltYWdlSW5mbz8ud2lkdGggfHwgNjQgfSxcbiAgb3V0cHV0SGVpZ2h0OiAgICAgeyBvZmZMYWJlbDogJ2F1dG8nLCAgZGVmYXVsdFZhbHVlOiAoKSA9PiBzdGF0ZS5pbWFnZUluZm8/LmhlaWdodCB8fCA2NCB9LFxufTtcblxuZnVuY3Rpb24gcmVuZGVyU2V0dGluZ3MoKTogdm9pZCB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtbGlzdCcpITtcblxuICAvLyBEb24ndCBjbG9iYmVyIHRoZSBET00gd2hpbGUgdGhlIHVzZXIgaXMgZm9jdXNlZCBvbiBhbiBpbmxpbmUgaW5wdXRcbiAgY29uc3QgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG4gIGlmIChmb2N1c2VkICYmIGZvY3VzZWQuY2xhc3NMaXN0Py5jb250YWlucygnc2V0dGluZy1pbmxpbmUtaW5wdXQnKSAmJiBsaXN0LmNvbnRhaW5zKGZvY3VzZWQpKSB7XG4gICAgLy8gVXBkYXRlIG5vbi1pbnB1dCBwYXJ0cyBvbmx5OiBmb2N1cyBpbmRpY2F0b3IsIGNoYW5nZWQgY2xhc3Nlc1xuICAgIHVwZGF0ZVNldHRpbmdzRm9jdXNPbmx5KGxpc3QpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3MoKTtcbiAgbGV0IHJvd0luZGV4ID0gMDtcbiAgbGV0IGh0bWwgPSAnJztcblxuICBmb3IgKGNvbnN0IHMgb2Ygc2V0dGluZ3MpIHtcbiAgICBpZiAocy5zZWN0aW9uKSB7XG4gICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2V0dGluZy1zZWN0aW9uXCI+JHtzLnNlY3Rpb259PC9kaXY+YDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgaXNGb2N1c2VkID0gcm93SW5kZXggPT09IHN0YXRlLnNldHRpbmdzRm9jdXNJbmRleCA/ICcgZm9jdXNlZCcgOiAnJztcbiAgICAgIGNvbnN0IGNoYW5nZWQgPSBzLmNoYW5nZWQgPyAnIGNoYW5nZWQnIDogJyc7XG5cbiAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZXR0aW5nLXJvdyR7aXNGb2N1c2VkfVwiIGRhdGEtaW5kZXg9XCIke3Jvd0luZGV4fVwiIGRhdGEta2V5PVwiJHtzLmtleX1cIj5gO1xuICAgICAgaHRtbCArPSBgPHNwYW4gY2xhc3M9XCJzZXR0aW5nLWluZGljYXRvclwiPiYjOTY1NDs8L3NwYW4+YDtcbiAgICAgIGh0bWwgKz0gYDxzcGFuIGNsYXNzPVwic2V0dGluZy1sYWJlbFwiPiR7cy5sYWJlbH08L3NwYW4+YDtcbiAgICAgIGh0bWwgKz0gYDxzcGFuIGNsYXNzPVwic2V0dGluZy12YWx1ZSR7Y2hhbmdlZH1cIj5gO1xuXG4gICAgICBpZiAoU0VMRUNUX1NFVFRJTkdTLmluY2x1ZGVzKHMua2V5KSkge1xuICAgICAgICAvLyBBbHdheXMgcmVuZGVyIGFzIGRyb3Bkb3duXG4gICAgICAgIGh0bWwgKz0gcmVuZGVySW5saW5lU2VsZWN0KHMua2V5KTtcbiAgICAgIH0gZWxzZSBpZiAoQk9PTEVBTl9TRVRUSU5HUy5pbmNsdWRlcyhzLmtleSkpIHtcbiAgICAgICAgLy8gUmVuZGVyIGFzIGNsaWNrYWJsZSB0b2dnbGVcbiAgICAgICAgaHRtbCArPSBgPHNwYW4gY2xhc3M9XCJzZXR0aW5nLXRvZ2dsZVwiIGRhdGEta2V5PVwiJHtzLmtleX1cIj4ke2VzY2FwZUh0bWwocy52YWx1ZSl9PC9zcGFuPmA7XG4gICAgICB9IGVsc2UgaWYgKEZJTEVfU0VUVElOR1MuaW5jbHVkZXMocy5rZXkpKSB7XG4gICAgICAgIC8vIEZpbGUgc2V0dGluZ3M6IGNsaWNrYWJsZSB0byBvcGVuIGRpYWxvZywgd2l0aCBjbGVhciBidXR0b24gd2hlbiBhY3RpdmVcbiAgICAgICAgaWYgKHMuY2hhbmdlZCkge1xuICAgICAgICAgIGh0bWwgKz0gZXNjYXBlSHRtbChzLnZhbHVlKTtcbiAgICAgICAgICBodG1sICs9IGA8c3BhbiBjbGFzcz1cInNldHRpbmctY2xlYXJcIiBkYXRhLWtleT1cIiR7cy5rZXl9XCIgdGl0bGU9XCJDbGVhclwiPlxcdTAwZDc8L3NwYW4+YDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBodG1sICs9IGA8c3BhbiBjbGFzcz1cInNldHRpbmctdG9nZ2xlXCIgZGF0YS1rZXk9XCIke3Mua2V5fVwiPiR7ZXNjYXBlSHRtbChzLnZhbHVlKX08L3NwYW4+YDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChJTlBVVF9TRVRUSU5HUy5pbmNsdWRlcyhzLmtleSkpIHtcbiAgICAgICAgLy8gQWx3YXlzLXZpc2libGUgaW5saW5lIGlucHV0XG4gICAgICAgIGh0bWwgKz0gcmVuZGVySW5saW5lSW5wdXQocy5rZXkpO1xuICAgICAgICBpZiAocy5rZXkgaW4gTlVMTEFCTEVfU0VUVElOR1MgJiYgcy5jaGFuZ2VkKSB7XG4gICAgICAgICAgY29uc3QgbnVsbGFibGUgPSBOVUxMQUJMRV9TRVRUSU5HU1tzLmtleV07XG4gICAgICAgICAgaHRtbCArPSBgPHNwYW4gY2xhc3M9XCJzZXR0aW5nLWNsZWFyXCIgZGF0YS1rZXk9XCIke3Mua2V5fVwiIHRpdGxlPVwiUmVzZXQgdG8gJHtudWxsYWJsZS5vZmZMYWJlbH1cIj5cXHUwMGQ3PC9zcGFuPmA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGh0bWwgKz0gZXNjYXBlSHRtbChzLnZhbHVlKTtcbiAgICAgIH1cblxuICAgICAgaHRtbCArPSBgPC9zcGFuPmA7XG4gICAgICBodG1sICs9IGA8L2Rpdj5gO1xuICAgICAgLy8gSGVscCB0ZXh0IGFsd2F5cyB2aXNpYmxlXG4gICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2V0dGluZy1oZWxwXCI+JHtzLmhlbHB9PC9kaXY+YDtcblxuICAgICAgLy8gUGFsZXR0ZSBzd2F0Y2hlcyAoYWZ0ZXIgcGFsZXR0ZSwgbG9zcGVjLCBvciBwYWxldHRlRmlsZSByb3cpXG4gICAgICBpZiAoKHMua2V5ID09PSAncGFsZXR0ZU5hbWUnIHx8IHMua2V5ID09PSAnbG9zcGVjU2x1ZycgfHwgcy5rZXkgPT09ICdwYWxldHRlRmlsZScpICYmIHN0YXRlLnBhbGV0dGVDb2xvcnMgJiYgc3RhdGUucGFsZXR0ZUNvbG9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmICgocy5rZXkgPT09ICdwYWxldHRlTmFtZScgJiYgc3RhdGUuY29uZmlnLnBhbGV0dGVOYW1lICE9PSBudWxsKSB8fFxuICAgICAgICAgICAgKHMua2V5ID09PSAnbG9zcGVjU2x1ZycgJiYgc3RhdGUuY29uZmlnLmxvc3BlY1NsdWcgIT09IG51bGwpIHx8XG4gICAgICAgICAgICAocy5rZXkgPT09ICdwYWxldHRlRmlsZScgJiYgc3RhdGUuY29uZmlnLmN1c3RvbVBhbGV0dGUgIT09IG51bGwgJiYgc3RhdGUuY29uZmlnLmxvc3BlY1NsdWcgPT09IG51bGwpKSB7XG4gICAgICAgICAgaHRtbCArPSByZW5kZXJQYWxldHRlU3dhdGNoZXMoc3RhdGUucGFsZXR0ZUNvbG9ycyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTG9zcGVjIGluZm8vZXJyb3IgYWZ0ZXIgbG9zcGVjIHJvd1xuICAgICAgaWYgKHMua2V5ID09PSAnbG9zcGVjU2x1ZycpIHtcbiAgICAgICAgaWYgKHN0YXRlLmxvc3BlY0xvYWRpbmcpIHtcbiAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwibG9zcGVjLWluZm8gbG9zcGVjLWxvYWRpbmdcIj5GZXRjaGluZyBwYWxldHRlLi4uPC9kaXY+YDtcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5sb3NwZWNFcnJvcikge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJsb3NwZWMtZXJyb3JcIj4ke2VzY2FwZUh0bWwoc3RhdGUubG9zcGVjRXJyb3IpfTwvZGl2PmA7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUubG9zcGVjUmVzdWx0ICYmIHN0YXRlLmNvbmZpZy5sb3NwZWNTbHVnKSB7XG4gICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImxvc3BlYy1pbmZvXCI+JHtlc2NhcGVIdG1sKHN0YXRlLmxvc3BlY1Jlc3VsdC5uYW1lKX0gXFx1MjAxNCAke3N0YXRlLmxvc3BlY1Jlc3VsdC5udW1Db2xvcnN9IGNvbG9yczwvZGl2PmA7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcm93SW5kZXgrKztcbiAgICB9XG4gIH1cbiAgbGlzdC5pbm5lckhUTUwgPSBodG1sO1xufVxuXG4vLyBMaWdodHdlaWdodCByZS1yZW5kZXI6IGp1c3QgdXBkYXRlIGZvY3VzL2NoYW5nZWQgY2xhc3NlcyB3aXRob3V0IGRlc3Ryb3lpbmcgaW5wdXRzXG5mdW5jdGlvbiB1cGRhdGVTZXR0aW5nc0ZvY3VzT25seShsaXN0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCByb3dzID0gbGlzdC5xdWVyeVNlbGVjdG9yQWxsKCcuc2V0dGluZy1yb3cnKTtcbiAgcm93cy5mb3JFYWNoKChyb3csIGkpID0+IHtcbiAgICAocm93IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QudG9nZ2xlKCdmb2N1c2VkJywgaSA9PT0gc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclBhbGV0dGVTd2F0Y2hlcyhjb2xvcnM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgbGV0IGh0bWwgPSAnPGRpdiBjbGFzcz1cInBhbGV0dGUtc3dhdGNoZXNcIj4nO1xuICBmb3IgKGNvbnN0IGNvbG9yIG9mIGNvbG9ycykge1xuICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJwYWxldHRlLXN3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZDoke2NvbG9yfVwiIHRpdGxlPVwiJHtjb2xvcn1cIj48L2Rpdj5gO1xuICB9XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG4gIHJldHVybiBodG1sO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVIdG1sKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoLz4vZywgJyZndDsnKS5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlcklubGluZVNlbGVjdChrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnZG93bnNjYWxlTW9kZSc6IHtcbiAgICAgIGNvbnN0IG9wdHMgPSBET1dOU0NBTEVfTU9ERVMubWFwKG0gPT5cbiAgICAgICAgYDxvcHRpb24gdmFsdWU9XCIke219XCIke20gPT09IGMuZG93bnNjYWxlTW9kZSA/ICcgc2VsZWN0ZWQnIDogJyd9PiR7bX08L29wdGlvbj5gXG4gICAgICApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8c2VsZWN0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtc2VsZWN0XCIgZGF0YS1rZXk9XCIke2tleX1cIj4ke29wdHN9PC9zZWxlY3Q+YDtcbiAgICB9XG4gICAgY2FzZSAncGFsZXR0ZU5hbWUnOiB7XG4gICAgICBsZXQgb3B0cyA9IGA8b3B0aW9uIHZhbHVlPVwiXCIke2MucGFsZXR0ZU5hbWUgPT09IG51bGwgPyAnIHNlbGVjdGVkJyA6ICcnfT5ub25lPC9vcHRpb24+YDtcbiAgICAgIG9wdHMgKz0gc3RhdGUucGFsZXR0ZXMubWFwKHAgPT5cbiAgICAgICAgYDxvcHRpb24gdmFsdWU9XCIke3Auc2x1Z31cIiR7cC5zbHVnID09PSBjLnBhbGV0dGVOYW1lID8gJyBzZWxlY3RlZCcgOiAnJ30+JHtwLnNsdWd9ICgke3AubnVtQ29sb3JzfSk8L29wdGlvbj5gXG4gICAgICApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8c2VsZWN0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtc2VsZWN0XCIgZGF0YS1rZXk9XCIke2tleX1cIj4ke29wdHN9PC9zZWxlY3Q+YDtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJJbmxpbmVJbnB1dChrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnZ3JpZFNpemUnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmdyaWRTaXplID09PSBudWxsID8gJycgOiBjLmdyaWRTaXplO1xuICAgICAgcmV0dXJuIGA8aW5wdXQgY2xhc3M9XCJzZXR0aW5nLWlubGluZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke3ZhbH1cIiBwbGFjZWhvbGRlcj1cImF1dG9cIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ2dyaWRQaGFzZVgnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmdyaWRQaGFzZVggPT09IG51bGwgPyAnJyA6IGMuZ3JpZFBoYXNlWDtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCJhdXRvXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdncmlkUGhhc2VZJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5ncmlkUGhhc2VZID09PSBudWxsID8gJycgOiBjLmdyaWRQaGFzZVk7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwiYXV0b1wiIGRhdGEta2V5PVwiJHtrZXl9XCI+YDtcbiAgICB9XG4gICAgY2FzZSAnbWF4R3JpZENhbmRpZGF0ZSc6IHtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHtjLm1heEdyaWRDYW5kaWRhdGV9XCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdhYVRocmVzaG9sZCc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMuYWFUaHJlc2hvbGQgPT09IG51bGwgPyAnJyA6IGMuYWFUaHJlc2hvbGQudG9GaXhlZCgyKTtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCJvZmZcIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ2F1dG9Db2xvcnMnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmF1dG9Db2xvcnMgPT09IG51bGwgPyAnJyA6IGMuYXV0b0NvbG9ycztcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCJvZmZcIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ2JnQ29sb3InOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLmJnQ29sb3IgPz8gJyc7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbCh2YWwpfVwiIHBsYWNlaG9sZGVyPVwiYXV0byAoI1JSR0dCQilcIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ2JvcmRlclRocmVzaG9sZCc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMuYm9yZGVyVGhyZXNob2xkID09PSBudWxsID8gJycgOiBjLmJvcmRlclRocmVzaG9sZC50b0ZpeGVkKDIpO1xuICAgICAgcmV0dXJuIGA8aW5wdXQgY2xhc3M9XCJzZXR0aW5nLWlubGluZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke3ZhbH1cIiBwbGFjZWhvbGRlcj1cIjAuNDBcIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ2JnVG9sZXJhbmNlJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5iZ1RvbGVyYW5jZS50b0ZpeGVkKDIpO1xuICAgICAgcmV0dXJuIGA8aW5wdXQgY2xhc3M9XCJzZXR0aW5nLWlubGluZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke3ZhbH1cIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ291dHB1dFNjYWxlJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5vdXRwdXRTY2FsZSA9PT0gbnVsbCA/ICcnIDogYy5vdXRwdXRTY2FsZTtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCJvZmZcIiBkYXRhLWtleT1cIiR7a2V5fVwiPmA7XG4gICAgfVxuICAgIGNhc2UgJ291dHB1dFdpZHRoJzoge1xuICAgICAgY29uc3QgdmFsID0gYy5vdXRwdXRXaWR0aCA9PT0gbnVsbCA/ICcnIDogYy5vdXRwdXRXaWR0aDtcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHt2YWx9XCIgcGxhY2Vob2xkZXI9XCJhdXRvXCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBjYXNlICdvdXRwdXRIZWlnaHQnOiB7XG4gICAgICBjb25zdCB2YWwgPSBjLm91dHB1dEhlaWdodCA9PT0gbnVsbCA/ICcnIDogYy5vdXRwdXRIZWlnaHQ7XG4gICAgICByZXR1cm4gYDxpbnB1dCBjbGFzcz1cInNldHRpbmctaW5saW5lLWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7dmFsfVwiIHBsYWNlaG9sZGVyPVwiYXV0b1wiIGRhdGEta2V5PVwiJHtrZXl9XCI+YDtcbiAgICB9XG4gICAgY2FzZSAnbG9zcGVjU2x1Zyc6IHtcbiAgICAgIGNvbnN0IHZhbCA9IGMubG9zcGVjU2x1ZyA/PyAnJztcbiAgICAgIHJldHVybiBgPGlucHV0IGNsYXNzPVwic2V0dGluZy1pbmxpbmUtaW5wdXQgc2V0dGluZy1pbmxpbmUtaW5wdXQtd2lkZVwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwodmFsKX1cIiBwbGFjZWhvbGRlcj1cImUuZy4gcGljby04XCIgZGF0YS1rZXk9XCIke2tleX1cIj5gO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0RWRpdGluZyhrZXk6IHN0cmluZyk6IHZvaWQge1xuICAvLyBCb29sZWFucyB0b2dnbGUgaW1tZWRpYXRlbHlcbiAgaWYgKEJPT0xFQU5fU0VUVElOR1MuaW5jbHVkZXMoa2V5KSkge1xuICAgIGFkanVzdFNldHRpbmcoa2V5LCAxKTtcbiAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgIGF1dG9Qcm9jZXNzKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIFNlbGVjdHMgYXJlIGFsd2F5cyB2aXNpYmxlXG4gIGlmIChTRUxFQ1RfU0VUVElOR1MuaW5jbHVkZXMoa2V5KSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBGaWxlIHNldHRpbmdzIG9wZW4gYSBmaWxlIGRpYWxvZ1xuICBpZiAoRklMRV9TRVRUSU5HUy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgaWYgKGtleSA9PT0gJ3BhbGV0dGVGaWxlJykge1xuICAgICAgbG9hZFBhbGV0dGVGaWxlRGlhbG9nKCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuICAvLyBGb3IgaW5saW5lIGlucHV0cywganVzdCBmb2N1cyB0aGUgaW5wdXQgZWxlbWVudFxuICBpZiAoSU5QVVRfU0VUVElOR1MuaW5jbHVkZXMoa2V5KSkge1xuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgLnNldHRpbmctaW5saW5lLWlucHV0W2RhdGEta2V5PVwiJHtrZXl9XCJdYCkgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgaWYgKGlucHV0KSB7XG4gICAgICBpbnB1dC5mb2N1cygpO1xuICAgICAgaW5wdXQuc2VsZWN0KCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxufVxuXG5mdW5jdGlvbiBjbGVhclNldHRpbmcoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgYyA9IHN0YXRlLmNvbmZpZztcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdncmlkU2l6ZSc6IGMuZ3JpZFNpemUgPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdncmlkUGhhc2VYJzogYy5ncmlkUGhhc2VYID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnZ3JpZFBoYXNlWSc6IGMuZ3JpZFBoYXNlWSA9IG51bGw7IGJyZWFrO1xuICAgIGNhc2UgJ2FhVGhyZXNob2xkJzogYy5hYVRocmVzaG9sZCA9IG51bGw7IGJyZWFrO1xuICAgIGNhc2UgJ2F1dG9Db2xvcnMnOiBjLmF1dG9Db2xvcnMgPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdsb3NwZWNTbHVnJzpcbiAgICAgIGMubG9zcGVjU2x1ZyA9IG51bGw7XG4gICAgICBjLmN1c3RvbVBhbGV0dGUgPSBudWxsO1xuICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAncGFsZXR0ZUZpbGUnOlxuICAgICAgaWYgKCFjLmxvc3BlY1NsdWcpIHtcbiAgICAgICAgYy5jdXN0b21QYWxldHRlID0gbnVsbDtcbiAgICAgICAgc3RhdGUucGFsZXR0ZUNvbG9ycyA9IG51bGw7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdiZ0NvbG9yJzogYy5iZ0NvbG9yID0gbnVsbDsgYnJlYWs7XG4gICAgY2FzZSAnYm9yZGVyVGhyZXNob2xkJzogYy5ib3JkZXJUaHJlc2hvbGQgPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdvdXRwdXRTY2FsZSc6IGMub3V0cHV0U2NhbGUgPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdvdXRwdXRXaWR0aCc6IGMub3V0cHV0V2lkdGggPSBudWxsOyBicmVhaztcbiAgICBjYXNlICdvdXRwdXRIZWlnaHQnOiBjLm91dHB1dEhlaWdodCA9IG51bGw7IGJyZWFrO1xuICB9XG4gIHJlbmRlclNldHRpbmdzKCk7XG4gIGF1dG9Qcm9jZXNzKCk7XG59XG5cbmZ1bmN0aW9uIGNvbW1pdEVkaXQoa2V5OiBzdHJpbmcsIHJhd1ZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgYyA9IHN0YXRlLmNvbmZpZztcbiAgY29uc3QgdmFsID0gcmF3VmFsdWUudHJpbSgpO1xuXG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnZ3JpZFNpemUnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnYXV0bycpIHtcbiAgICAgICAgYy5ncmlkU2l6ZSA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuID0gcGFyc2VJbnQodmFsKTtcbiAgICAgICAgaWYgKCFpc05hTihuKSAmJiBuID49IDEpIGMuZ3JpZFNpemUgPSBuO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZ3JpZFBoYXNlWCc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdhdXRvJykge1xuICAgICAgICBjLmdyaWRQaGFzZVggPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAwKSBjLmdyaWRQaGFzZVggPSBuO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZ3JpZFBoYXNlWSc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdhdXRvJykge1xuICAgICAgICBjLmdyaWRQaGFzZVkgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAwKSBjLmdyaWRQaGFzZVkgPSBuO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnbWF4R3JpZENhbmRpZGF0ZSc6IHtcbiAgICAgIGNvbnN0IG4gPSBwYXJzZUludCh2YWwpO1xuICAgICAgaWYgKCFpc05hTihuKSAmJiBuID49IDIpIGMubWF4R3JpZENhbmRpZGF0ZSA9IE1hdGgubWluKDY0LCBuKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdhYVRocmVzaG9sZCc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdvZmYnKSB7XG4gICAgICAgIGMuYWFUaHJlc2hvbGQgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlRmxvYXQodmFsKTtcbiAgICAgICAgaWYgKCFpc05hTihuKSkgYy5hYVRocmVzaG9sZCA9IE1hdGgubWF4KDAuMDEsIE1hdGgubWluKDEuMCwgbikpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYXV0b0NvbG9ycyc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdvZmYnKSB7XG4gICAgICAgIGMuYXV0b0NvbG9ycyA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuID0gcGFyc2VJbnQodmFsKTtcbiAgICAgICAgaWYgKCFpc05hTihuKSAmJiBuID49IDIpIHtcbiAgICAgICAgICBjLmF1dG9Db2xvcnMgPSBNYXRoLm1pbigyNTYsIG4pO1xuICAgICAgICAgIGMucGFsZXR0ZU5hbWUgPSBudWxsO1xuICAgICAgICAgIGMubG9zcGVjU2x1ZyA9IG51bGw7XG4gICAgICAgICAgYy5jdXN0b21QYWxldHRlID0gbnVsbDtcbiAgICAgICAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gbnVsbDtcbiAgICAgICAgICBzdGF0ZS5sb3NwZWNSZXN1bHQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdiZ0NvbG9yJzpcbiAgICAgIGlmICh2YWwgPT09ICcnIHx8IHZhbCA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIGMuYmdDb2xvciA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBBY2NlcHQgd2l0aCBvciB3aXRob3V0ICNcbiAgICAgICAgY29uc3QgaGV4ID0gdmFsLnN0YXJ0c1dpdGgoJyMnKSA/IHZhbCA6ICcjJyArIHZhbDtcbiAgICAgICAgaWYgKC9eI1swLTlBLUZhLWZdezZ9JC8udGVzdChoZXgpKSB7XG4gICAgICAgICAgYy5iZ0NvbG9yID0gaGV4LnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2JvcmRlclRocmVzaG9sZCc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdhdXRvJykge1xuICAgICAgICBjLmJvcmRlclRocmVzaG9sZCA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuID0gcGFyc2VGbG9hdCh2YWwpO1xuICAgICAgICBpZiAoIWlzTmFOKG4pKSBjLmJvcmRlclRocmVzaG9sZCA9IE1hdGgubWF4KDAuMDEsIE1hdGgubWluKDEuMCwgbikpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYmdUb2xlcmFuY2UnOiB7XG4gICAgICBjb25zdCBuID0gcGFyc2VGbG9hdCh2YWwpO1xuICAgICAgaWYgKCFpc05hTihuKSkgYy5iZ1RvbGVyYW5jZSA9IE1hdGgubWF4KDAuMDEsIE1hdGgubWluKDAuNTAsIG4pKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdkb3duc2NhbGVNb2RlJzpcbiAgICAgIGlmIChET1dOU0NBTEVfTU9ERVMuaW5jbHVkZXModmFsKSkgYy5kb3duc2NhbGVNb2RlID0gdmFsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAncGFsZXR0ZU5hbWUnOlxuICAgICAgYy5wYWxldHRlTmFtZSA9IHZhbCA9PT0gJycgPyBudWxsIDogdmFsO1xuICAgICAgaWYgKGMucGFsZXR0ZU5hbWUgIT09IG51bGwpIHtcbiAgICAgICAgYy5hdXRvQ29sb3JzID0gbnVsbDtcbiAgICAgICAgYy5sb3NwZWNTbHVnID0gbnVsbDtcbiAgICAgICAgYy5jdXN0b21QYWxldHRlID0gbnVsbDtcbiAgICAgICAgc3RhdGUubG9zcGVjUmVzdWx0ID0gbnVsbDtcbiAgICAgICAgZmV0Y2hQYWxldHRlQ29sb3JzKGMucGFsZXR0ZU5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdGUucGFsZXR0ZUNvbG9ycyA9IG51bGw7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdsb3NwZWNTbHVnJzpcbiAgICAgIC8vIExvc3BlYzogY29tbWl0IHRyaWdnZXJzIGEgZmV0Y2hcbiAgICAgIGlmICh2YWwgPT09ICcnIHx8IHZhbCA9PT0gJ25vbmUnKSB7XG4gICAgICAgIGMubG9zcGVjU2x1ZyA9IG51bGw7XG4gICAgICAgIGMuY3VzdG9tUGFsZXR0ZSA9IG51bGw7XG4gICAgICAgIHN0YXRlLmxvc3BlY1Jlc3VsdCA9IG51bGw7XG4gICAgICAgIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICAgICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgICBhdXRvUHJvY2VzcygpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBmZXRjaExvc3BlYyh2YWwpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgJ291dHB1dFNjYWxlJzpcbiAgICAgIGlmICh2YWwgPT09ICcnIHx8IHZhbCA9PT0gJ29mZicgfHwgdmFsID09PSAnMScpIHtcbiAgICAgICAgYy5vdXRwdXRTY2FsZSA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuID0gcGFyc2VJbnQodmFsKTtcbiAgICAgICAgaWYgKCFpc05hTihuKSAmJiBuID49IDIgJiYgbiA8PSAxNikgYy5vdXRwdXRTY2FsZSA9IG47XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvdXRwdXRXaWR0aCc6XG4gICAgICBpZiAodmFsID09PSAnJyB8fCB2YWwgPT09ICdhdXRvJykge1xuICAgICAgICBjLm91dHB1dFdpZHRoID0gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG4gPSBwYXJzZUludCh2YWwpO1xuICAgICAgICBpZiAoIWlzTmFOKG4pICYmIG4gPj0gMSkgYy5vdXRwdXRXaWR0aCA9IG47XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvdXRwdXRIZWlnaHQnOlxuICAgICAgaWYgKHZhbCA9PT0gJycgfHwgdmFsID09PSAnYXV0bycpIHtcbiAgICAgICAgYy5vdXRwdXRIZWlnaHQgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHZhbCk7XG4gICAgICAgIGlmICghaXNOYU4obikgJiYgbiA+PSAxKSBjLm91dHB1dEhlaWdodCA9IG47XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgfVxuXG4gIHJlbmRlclNldHRpbmdzKCk7XG4gIGF1dG9Qcm9jZXNzKCk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gRGlhZ25vc3RpY3MgcmVuZGVyaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gcmVuZGVyRGlhZ25vc3RpY3MoKTogdm9pZCB7XG4gIGNvbnN0IGluZm8gPSBzdGF0ZS5pbWFnZUluZm87XG4gIGlmICghaW5mbykge1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkaWFnLWdyaWQtaW5mbycpIS5pbm5lckhUTUwgPVxuICAgICAgJzxkaXYgY2xhc3M9XCJkaWFnLWl0ZW1cIj48c3BhbiBjbGFzcz1cImxhYmVsXCI+Tm8gaW1hZ2UgbG9hZGVkPC9zcGFuPjwvZGl2Pic7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RpYWctZ3JpZC1iYXJzJykhLmlubmVySFRNTCA9ICcnO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkaWFnLWluZm8nKSEuaW5uZXJIVE1MID0gJyc7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RpYWctaGlzdG9ncmFtJykhLmlubmVySFRNTCA9ICcnO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBncmlkSHRtbCA9ICcnO1xuICBncmlkSHRtbCArPSBgPGRpdiBjbGFzcz1cImRpYWctaXRlbVwiPjxzcGFuIGNsYXNzPVwibGFiZWxcIj5EZXRlY3RlZCBzaXplPC9zcGFuPjxzcGFuIGNsYXNzPVwidmFsdWVcIj4ke2luZm8uZ3JpZFNpemUgPz8gJ25vbmUnfTwvc3Bhbj48L2Rpdj5gO1xuICBncmlkSHRtbCArPSBgPGRpdiBjbGFzcz1cImRpYWctaXRlbVwiPjxzcGFuIGNsYXNzPVwibGFiZWxcIj5Db25maWRlbmNlPC9zcGFuPjxzcGFuIGNsYXNzPVwidmFsdWVcIj4ke2luZm8uZ3JpZENvbmZpZGVuY2UgIT0gbnVsbCA/IChpbmZvLmdyaWRDb25maWRlbmNlICogMTAwKS50b0ZpeGVkKDEpICsgJyUnIDogJ24vYSd9PC9zcGFuPjwvZGl2PmA7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkaWFnLWdyaWQtaW5mbycpIS5pbm5lckhUTUwgPSBncmlkSHRtbDtcblxuICBsZXQgYmFyc0h0bWwgPSAnJztcbiAgaWYgKGluZm8uZ3JpZFNjb3JlcyAmJiBpbmZvLmdyaWRTY29yZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG1heFNjb3JlID0gTWF0aC5tYXgoLi4uaW5mby5ncmlkU2NvcmVzLm1hcChzID0+IHNbMV0pKTtcbiAgICBjb25zdCBiZXN0U2l6ZSA9IGluZm8uZ3JpZFNpemU7XG4gICAgZm9yIChjb25zdCBbc2l6ZSwgc2NvcmVdIG9mIGluZm8uZ3JpZFNjb3Jlcykge1xuICAgICAgY29uc3QgcGN0ID0gbWF4U2NvcmUgPiAwID8gKHNjb3JlIC8gbWF4U2NvcmUgKiAxMDApIDogMDtcbiAgICAgIGNvbnN0IGJlc3QgPSBzaXplID09PSBiZXN0U2l6ZSA/ICcgYmVzdCcgOiAnJztcbiAgICAgIGJhcnNIdG1sICs9IGA8ZGl2IGNsYXNzPVwiZ3JpZC1iYXItcm93XCI+YDtcbiAgICAgIGJhcnNIdG1sICs9IGA8c3BhbiBjbGFzcz1cImdyaWQtYmFyLWxhYmVsXCI+JHtzaXplfTwvc3Bhbj5gO1xuICAgICAgYmFyc0h0bWwgKz0gYDxkaXYgY2xhc3M9XCJncmlkLWJhci10cmFja1wiPjxkaXYgY2xhc3M9XCJncmlkLWJhci1maWxsJHtiZXN0fVwiIHN0eWxlPVwid2lkdGg6JHtwY3R9JVwiPjwvZGl2PjwvZGl2PmA7XG4gICAgICBiYXJzSHRtbCArPSBgPHNwYW4gY2xhc3M9XCJncmlkLWJhci12YWx1ZVwiPiR7c2NvcmUudG9GaXhlZCgzKX08L3NwYW4+YDtcbiAgICAgIGJhcnNIdG1sICs9IGA8L2Rpdj5gO1xuICAgIH1cbiAgfVxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlhZy1ncmlkLWJhcnMnKSEuaW5uZXJIVE1MID0gYmFyc0h0bWw7XG5cbiAgbGV0IGluZm9IdG1sID0gJyc7XG4gIGluZm9IdG1sICs9IGA8ZGl2IGNsYXNzPVwiZGlhZy1pdGVtXCI+PHNwYW4gY2xhc3M9XCJsYWJlbFwiPkRpbWVuc2lvbnM8L3NwYW4+PHNwYW4gY2xhc3M9XCJ2YWx1ZVwiPiR7aW5mby53aWR0aH0geCAke2luZm8uaGVpZ2h0fTwvc3Bhbj48L2Rpdj5gO1xuICBpbmZvSHRtbCArPSBgPGRpdiBjbGFzcz1cImRpYWctaXRlbVwiPjxzcGFuIGNsYXNzPVwibGFiZWxcIj5VbmlxdWUgY29sb3JzPC9zcGFuPjxzcGFuIGNsYXNzPVwidmFsdWVcIj4ke2luZm8udW5pcXVlQ29sb3JzfTwvc3Bhbj48L2Rpdj5gO1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlhZy1pbmZvJykhLmlubmVySFRNTCA9IGluZm9IdG1sO1xuXG4gIGxldCBoaXN0SHRtbCA9ICcnO1xuICBpZiAoaW5mby5oaXN0b2dyYW0pIHtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGluZm8uaGlzdG9ncmFtKSB7XG4gICAgICBoaXN0SHRtbCArPSBgPGRpdiBjbGFzcz1cImNvbG9yLXJvd1wiPmA7XG4gICAgICBoaXN0SHRtbCArPSBgPGRpdiBjbGFzcz1cImNvbG9yLXN3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZDoke2VudHJ5LmhleH1cIj48L2Rpdj5gO1xuICAgICAgaGlzdEh0bWwgKz0gYDxzcGFuIGNsYXNzPVwiY29sb3ItaGV4XCI+JHtlbnRyeS5oZXh9PC9zcGFuPmA7XG4gICAgICBoaXN0SHRtbCArPSBgPGRpdiBjbGFzcz1cImNvbG9yLWJhci10cmFja1wiPjxkaXYgY2xhc3M9XCJjb2xvci1iYXItZmlsbFwiIHN0eWxlPVwid2lkdGg6JHtNYXRoLm1pbihlbnRyeS5wZXJjZW50LCAxMDApfSU7YmFja2dyb3VuZDoke2VudHJ5LmhleH1cIj48L2Rpdj48L2Rpdj5gO1xuICAgICAgaGlzdEh0bWwgKz0gYDxzcGFuIGNsYXNzPVwiY29sb3ItcGVyY2VudFwiPiR7ZW50cnkucGVyY2VudC50b0ZpeGVkKDEpfSU8L3NwYW4+YDtcbiAgICAgIGhpc3RIdG1sICs9IGA8L2Rpdj5gO1xuICAgIH1cbiAgfVxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlhZy1oaXN0b2dyYW0nKSEuaW5uZXJIVE1MID0gaGlzdEh0bWw7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gSW1hZ2UgbG9hZGluZyBhbmQgcHJvY2Vzc2luZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRJbWFnZUJsb2Iod2hpY2g6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGJ5dGVzID0gYXdhaXQgaW52b2tlPG51bWJlcltdPignZ2V0X2ltYWdlJywgeyB3aGljaCB9KTtcbiAgY29uc3QgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnl0ZXMpO1xuICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2Fycl0sIHsgdHlwZTogJ2ltYWdlL3BuZycgfSk7XG4gIHJldHVybiBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBvcGVuSW1hZ2UocGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIHNldFN0YXR1cygnTG9hZGluZyBpbWFnZS4uLicsICdwcm9jZXNzaW5nJyk7XG4gIC8vIFNob3cgcHJvbWluZW50IGxvYWRpbmcgb24gdGhlIHdlbGNvbWUgc2NyZWVuIGlmIGl0J3MgdmlzaWJsZVxuICBjb25zdCB3YXNPbldlbGNvbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnd2VsY29tZScpIS5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG4gIGlmICh3YXNPbldlbGNvbWUpIHtcbiAgICBzaG93V2VsY29tZUxvYWRpbmcoKTtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSBhd2FpdCBpbnZva2U8SW1hZ2VJbmZvPignb3Blbl9pbWFnZScsIHsgcGF0aCB9KTtcbiAgICBzdGF0ZS5pbWFnZUxvYWRlZCA9IHRydWU7XG4gICAgc3RhdGUuaW1hZ2VQYXRoID0gcGF0aDtcbiAgICBzdGF0ZS5pbWFnZUluZm8gPSBpbmZvO1xuICAgIHN0YXRlLmNvbmZpZyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoREVGQVVMVF9DT05GSUcpKTtcbiAgICBzdGF0ZS5sb3NwZWNSZXN1bHQgPSBudWxsO1xuICAgIHN0YXRlLmxvc3BlY0Vycm9yID0gbnVsbDtcbiAgICBzdGF0ZS5wYWxldHRlQ29sb3JzID0gbnVsbDtcblxuICAgIGNvbnN0IGZuYW1lID0gcGF0aC5zcGxpdCgnLycpLnBvcCgpIS5zcGxpdCgnXFxcXCcpLnBvcCgpITtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsZW5hbWUnKSEudGV4dENvbnRlbnQgPSBmbmFtZTtcblxuICAgIGhpZGVXZWxjb21lTG9hZGluZygpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3ZWxjb21lJykhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29yaWdpbmFsLXBhbmUnKSEuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHJvY2Vzc2VkLXBhbmUnKSEuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuICAgIGNvbnN0IFtvcmlnVXJsLCBwcm9jVXJsXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIGxvYWRJbWFnZUJsb2IoJ29yaWdpbmFsJyksXG4gICAgICBsb2FkSW1hZ2VCbG9iKCdwcm9jZXNzZWQnKSxcbiAgICBdKTtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29yaWdpbmFsLWltZycpIGFzIEhUTUxJbWFnZUVsZW1lbnQpLnNyYyA9IG9yaWdVcmw7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwcm9jZXNzZWQtaW1nJykgYXMgSFRNTEltYWdlRWxlbWVudCkuc3JjID0gcHJvY1VybDtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3JpZ2luYWwtZGltcycpIS50ZXh0Q29udGVudCA9IGAke2luZm8ud2lkdGh9XFx1MDBkNyR7aW5mby5oZWlnaHR9YDtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHJvY2Vzc2VkLWRpbXMnKSEudGV4dENvbnRlbnQgPSBgJHtpbmZvLndpZHRofVxcdTAwZDcke2luZm8uaGVpZ2h0fWA7XG5cbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmdzLXByZXZpZXctaW1nJykgYXMgSFRNTEltYWdlRWxlbWVudCkuc3JjID0gcHJvY1VybDtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtcHJldmlldy1pbWcnKSEuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmdzLW5vLWltYWdlJykhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cbiAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgIHJlbmRlckRpYWdub3N0aWNzKCk7XG4gICAgc2V0U3RhdHVzKGBMb2FkZWQgXFx1MjAxNCAke2luZm8ud2lkdGh9XFx1MDBkNyR7aW5mby5oZWlnaHR9LCBncmlkPSR7aW5mby5ncmlkU2l6ZSA/PyAnbm9uZSd9LCAke2luZm8udW5pcXVlQ29sb3JzfSBjb2xvcnNgLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaGlkZVdlbGNvbWVMb2FkaW5nKCk7XG4gICAgLy8gUmVzdG9yZSB3ZWxjb21lIHNjcmVlbiBvbiBlcnJvciBpZiB0aGF0J3Mgd2hlcmUgd2Ugd2VyZVxuICAgIGlmICh3YXNPbldlbGNvbWUpIHtcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3ZWxjb21lJykhLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgfVxuICAgIHNldFN0YXR1cygnRXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZFByb2Nlc3NDb25maWcoKTogUHJvY2Vzc0NvbmZpZyB7XG4gIGNvbnN0IGMgPSBzdGF0ZS5jb25maWc7XG4gIHJldHVybiB7XG4gICAgZ3JpZFNpemU6IGMuZ3JpZFNpemUsXG4gICAgZ3JpZFBoYXNlWDogYy5ncmlkUGhhc2VYLFxuICAgIGdyaWRQaGFzZVk6IGMuZ3JpZFBoYXNlWSxcbiAgICBtYXhHcmlkQ2FuZGlkYXRlOiBjLm1heEdyaWRDYW5kaWRhdGUgPT09IDMyID8gbnVsbCA6IGMubWF4R3JpZENhbmRpZGF0ZSxcbiAgICBub0dyaWREZXRlY3Q6IGMubm9HcmlkRGV0ZWN0LFxuICAgIGRvd25zY2FsZU1vZGU6IGMuZG93bnNjYWxlTW9kZSxcbiAgICBhYVRocmVzaG9sZDogYy5hYVRocmVzaG9sZCxcbiAgICBwYWxldHRlTmFtZTogYy5wYWxldHRlTmFtZSxcbiAgICBhdXRvQ29sb3JzOiBjLmF1dG9Db2xvcnMsXG4gICAgY3VzdG9tUGFsZXR0ZTogYy5jdXN0b21QYWxldHRlLFxuICAgIG5vUXVhbnRpemU6IGMubm9RdWFudGl6ZSxcbiAgICByZW1vdmVCZzogYy5yZW1vdmVCZyxcbiAgICBiZ0NvbG9yOiBjLmJnQ29sb3IsXG4gICAgYm9yZGVyVGhyZXNob2xkOiBjLmJvcmRlclRocmVzaG9sZCxcbiAgICBiZ1RvbGVyYW5jZTogYy5iZ1RvbGVyYW5jZSxcbiAgICBmbG9vZEZpbGw6IGMuZmxvb2RGaWxsLFxuICAgIG91dHB1dFNjYWxlOiBjLm91dHB1dFNjYWxlLFxuICAgIG91dHB1dFdpZHRoOiBjLm91dHB1dFdpZHRoLFxuICAgIG91dHB1dEhlaWdodDogYy5vdXRwdXRIZWlnaHQsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NJbWFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFzdGF0ZS5pbWFnZUxvYWRlZCB8fCBzdGF0ZS5wcm9jZXNzaW5nKSByZXR1cm47XG4gIHN0YXRlLnByb2Nlc3NpbmcgPSB0cnVlO1xuICBzZXRTdGF0dXMoJ1Byb2Nlc3NpbmcuLi4nLCAncHJvY2Vzc2luZycpO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZTxQcm9jZXNzUmVzdWx0PigncHJvY2VzcycsIHsgcGM6IGJ1aWxkUHJvY2Vzc0NvbmZpZygpIH0pO1xuICAgIHN0YXRlLmltYWdlSW5mbyA9IHsgLi4uc3RhdGUuaW1hZ2VJbmZvISwgLi4ucmVzdWx0IH07XG5cbiAgICBjb25zdCBwcm9jVXJsID0gYXdhaXQgbG9hZEltYWdlQmxvYigncHJvY2Vzc2VkJyk7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwcm9jZXNzZWQtaW1nJykgYXMgSFRNTEltYWdlRWxlbWVudCkuc3JjID0gcHJvY1VybDtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHJvY2Vzc2VkLWRpbXMnKSEudGV4dENvbnRlbnQgPSBgJHtyZXN1bHQud2lkdGh9XFx1MDBkNyR7cmVzdWx0LmhlaWdodH1gO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtcHJldmlldy1pbWcnKSBhcyBIVE1MSW1hZ2VFbGVtZW50KS5zcmMgPSBwcm9jVXJsO1xuXG4gICAgcmVuZGVyRGlhZ25vc3RpY3MoKTtcbiAgICBjb25zdCBlbGFwc2VkID0gKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAvIDEwMDApLnRvRml4ZWQoMik7XG4gICAgc3RhdGUubGFzdFByb2Nlc3NUaW1lID0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgICBzZXRTdGF0dXMoYFByb2Nlc3NlZCBcXHUyMDE0ICR7cmVzdWx0LndpZHRofVxcdTAwZDcke3Jlc3VsdC5oZWlnaHR9LCAke3Jlc3VsdC51bmlxdWVDb2xvcnN9IGNvbG9ycyAoJHtlbGFwc2VkfXMpYCwgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnRXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzdGF0ZS5wcm9jZXNzaW5nID0gZmFsc2U7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBGaWxlIGRpYWxvZ3Ncbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5hc3luYyBmdW5jdGlvbiBkb09wZW4oKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlbkRpYWxvZyh7XG4gICAgICBtdWx0aXBsZTogZmFsc2UsXG4gICAgICBmaWx0ZXJzOiBbe1xuICAgICAgICBuYW1lOiAnSW1hZ2VzJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydwbmcnLCAnanBnJywgJ2pwZWcnLCAnZ2lmJywgJ3dlYnAnLCAnYm1wJ10sXG4gICAgICB9XSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBhd2FpdCBvcGVuSW1hZ2UocmVzdWx0KTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yOiAnICsgZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9TYXZlKCk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIXN0YXRlLmltYWdlTG9hZGVkKSByZXR1cm47XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2F2ZURpYWxvZyh7XG4gICAgICBkZWZhdWx0UGF0aDogc3RhdGUuaW1hZ2VQYXRoID8gc3RhdGUuaW1hZ2VQYXRoLnJlcGxhY2UoL1xcLlteLl0rJC8sICdfZml4ZWQucG5nJykgOiAnb3V0cHV0LnBuZycsXG4gICAgICBmaWx0ZXJzOiBbe1xuICAgICAgICBuYW1lOiAnUE5HIEltYWdlJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydwbmcnXSxcbiAgICAgIH1dLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQpIHtcbiAgICAgIGF3YWl0IGludm9rZSgnc2F2ZV9pbWFnZScsIHsgcGF0aDogcmVzdWx0IH0pO1xuICAgICAgc2V0U3RhdHVzKCdTYXZlZDogJyArIHJlc3VsdC5zcGxpdCgnLycpLnBvcCgpIS5zcGxpdCgnXFxcXCcpLnBvcCgpISwgJ3N1Y2Nlc3MnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yOiAnICsgZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBLZXlib2FyZCBoYW5kbGluZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAvLyBXaGVuIGZvY3VzZWQgb24gYW4gYWx3YXlzLXZpc2libGUgaW5saW5lIGlucHV0LCBoYW5kbGUgRW50ZXIvRXNjYXBlL1RhYlxuICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdzZXR0aW5nLWlubGluZS1pbnB1dCcpKSB7XG4gICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgY29tbWl0RWRpdCh0YXJnZXQuZGF0YXNldC5rZXkhLCB0YXJnZXQudmFsdWUpO1xuICAgICAgdGFyZ2V0LmJsdXIoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnRXNjYXBlJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmJsdXIoKTtcbiAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ1RhYicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5ibHVyKCk7XG4gICAgICBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gV2hlbiBmb2N1c2VkIG9uIGFuIGlubGluZSBzZWxlY3QsIGxldCBpdCBoYW5kbGUgaXRzIG93biBrZXlzIGV4Y2VwdCBUYWJcbiAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0Py5jb250YWlucygnc2V0dGluZy1pbmxpbmUtc2VsZWN0JykpIHtcbiAgICBpZiAoZS5rZXkgPT09ICdUYWInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gSWdub3JlIG90aGVyIHR5cGluZyBpbiBpbnB1dHMgKHNoZWV0IGlucHV0cywgZXRjLilcbiAgY29uc3QgdGFnID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lO1xuICBpZiAodGFnID09PSAnSU5QVVQnIHx8IHRhZyA9PT0gJ1RFWFRBUkVBJykge1xuICAgIC8vIFN0aWxsIGFsbG93IFRhYiB0byBzd2l0Y2ggdGFicyBmcm9tIGFueSBpbnB1dFxuICAgIGlmIChlLmtleSA9PT0gJ1RhYicpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTsgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGtleSA9IGUua2V5O1xuXG4gIC8vIFRhYiBzd2l0Y2hpbmdcbiAgaWYgKGtleSA9PT0gJ1RhYicpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBjeWNsZVRhYihlLnNoaWZ0S2V5ID8gLTEgOiAxKTsgcmV0dXJuOyB9XG5cbiAgLy8gR2xvYmFsIHNob3J0Y3V0c1xuICBpZiAoa2V5ID09PSAnbycpIHsgZG9PcGVuKCk7IHJldHVybjsgfVxuICBpZiAoa2V5ID09PSAncycpIHsgZG9TYXZlKCk7IHJldHVybjsgfVxuICBpZiAoa2V5ID09PSAnICcpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBwcm9jZXNzSW1hZ2UoKTsgcmV0dXJuOyB9XG4gIGlmIChrZXkgPT09ICdyJykgeyByZXNldENvbmZpZygpOyByZXR1cm47IH1cbiAgaWYgKChlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSAmJiBrZXkgPT09ICdxJykgeyB3aW5kb3cuY2xvc2UoKTsgcmV0dXJuOyB9XG5cbiAgLy8gU2V0dGluZ3MgbmF2aWdhdGlvbiAob25seSBvbiBzZXR0aW5ncyB0YWIsIGJsb2NrZWQgZHVyaW5nIHByb2Nlc3NpbmcpXG4gIGlmIChzdGF0ZS5hY3RpdmVUYWIgPT09ICdzZXR0aW5ncycgJiYgIXN0YXRlLnByb2Nlc3NpbmcpIHtcbiAgICBjb25zdCByb3dzID0gZ2V0U2V0dGluZ1Jvd3MoKTtcbiAgICBpZiAoa2V5ID09PSAnaicgfHwga2V5ID09PSAnQXJyb3dEb3duJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ID0gTWF0aC5taW4oc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ICsgMSwgcm93cy5sZW5ndGggLSAxKTtcbiAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdrJyB8fCBrZXkgPT09ICdBcnJvd1VwJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ID0gTWF0aC5tYXgoc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4IC0gMSwgMCk7XG4gICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoa2V5ID09PSAnRW50ZXInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCByb3cgPSByb3dzW3N0YXRlLnNldHRpbmdzRm9jdXNJbmRleF07XG4gICAgICBpZiAocm93KSBzdGFydEVkaXRpbmcocm93LmtleSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBzd2l0Y2hUYWIoJ3ByZXZpZXcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGtleSA9PT0gJ2wnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCByb3cgPSByb3dzW3N0YXRlLnNldHRpbmdzRm9jdXNJbmRleF07XG4gICAgICBpZiAocm93KSB7XG4gICAgICAgIGFkanVzdFNldHRpbmcocm93LmtleSwgMSk7XG4gICAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgICAgIGF1dG9Qcm9jZXNzKCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdoJyB8fCBrZXkgPT09ICdBcnJvd0xlZnQnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCByb3cgPSByb3dzW3N0YXRlLnNldHRpbmdzRm9jdXNJbmRleF07XG4gICAgICBpZiAocm93KSB7XG4gICAgICAgIGFkanVzdFNldHRpbmcocm93LmtleSwgLTEpO1xuICAgICAgICByZW5kZXJTZXR0aW5ncygpO1xuICAgICAgICBhdXRvUHJvY2VzcygpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxufSk7XG5cbmNvbnN0IFRBQlMgPSBbJ3ByZXZpZXcnLCAnc2V0dGluZ3MnLCAnZGlhZ25vc3RpY3MnLCAnYmF0Y2gnLCAnc2hlZXQnXTtcblxuZnVuY3Rpb24gY3ljbGVUYWIoZGlyOiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IGlkeCA9IFRBQlMuaW5kZXhPZihzdGF0ZS5hY3RpdmVUYWIpO1xuICBpZHggPSAoaWR4ICsgZGlyICsgVEFCUy5sZW5ndGgpICUgVEFCUy5sZW5ndGg7XG4gIHN3aXRjaFRhYihUQUJTW2lkeF0pO1xufVxuXG5mdW5jdGlvbiByZXNldENvbmZpZygpOiB2b2lkIHtcbiAgc3RhdGUuY29uZmlnID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX0NPTkZJRykpO1xuICBzdGF0ZS5sb3NwZWNSZXN1bHQgPSBudWxsO1xuICBzdGF0ZS5sb3NwZWNFcnJvciA9IG51bGw7XG4gIHN0YXRlLnBhbGV0dGVDb2xvcnMgPSBudWxsO1xuICByZW5kZXJTZXR0aW5ncygpO1xuICBpZiAoc3RhdGUuaW1hZ2VMb2FkZWQpIHtcbiAgICBhdXRvUHJvY2VzcygpO1xuICB9XG4gIHNldFN0YXR1cygnQ29uZmlnIHJlc2V0IHRvIGRlZmF1bHRzJyk7XG59XG5cbi8vIEF1dG8tcHJvY2VzcyB3aXRoIGRlYm91bmNlXG5sZXQgcHJvY2Vzc1RpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gYXV0b1Byb2Nlc3MoKTogdm9pZCB7XG4gIGlmICghc3RhdGUuaW1hZ2VMb2FkZWQpIHJldHVybjtcbiAgaWYgKHByb2Nlc3NUaW1lcikgY2xlYXJUaW1lb3V0KHByb2Nlc3NUaW1lcik7XG4gIHByb2Nlc3NUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcHJvY2Vzc0ltYWdlKCksIDE1MCk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQmF0Y2ggdGFiXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gcmVuZGVyQmF0Y2goKTogdm9pZCB7XG4gIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JhdGNoLWNvbnRlbnQnKSE7XG4gIGxldCBodG1sID0gJyc7XG5cbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLXNlY3Rpb25cIj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtdGl0bGVcIj5CYXRjaCBQcm9jZXNzaW5nPC9kaXY+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLWRlc2NcIj5Qcm9jZXNzIG11bHRpcGxlIGltYWdlcyB3aXRoIHRoZSBjdXJyZW50IHBpcGVsaW5lIHNldHRpbmdzLjwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gRmlsZSBsaXN0XG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJiYXRjaC1zZWN0aW9uXCI+JztcbiAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImJhdGNoLXJvd1wiPjxzcGFuIGNsYXNzPVwiYmF0Y2gtbGFiZWxcIj5GaWxlczwvc3Bhbj48c3BhbiBjbGFzcz1cImJhdGNoLXZhbHVlXCI+JHtzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aH0gc2VsZWN0ZWQ8L3NwYW4+YDtcbiAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cImJhdGNoLWJ0blwiIGlkPVwiYmF0Y2gtYWRkLWZpbGVzXCIke3N0YXRlLmJhdGNoUnVubmluZyA/ICcgZGlzYWJsZWQnIDogJyd9PkFkZCBGaWxlczwvYnV0dG9uPmA7XG4gIGlmIChzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1kaW1cIiBpZD1cImJhdGNoLWNsZWFyLWZpbGVzXCIke3N0YXRlLmJhdGNoUnVubmluZyA/ICcgZGlzYWJsZWQnIDogJyd9PkNsZWFyPC9idXR0b24+YDtcbiAgfVxuICBodG1sICs9ICc8L2Rpdj4nO1xuXG4gIGlmIChzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtZmlsZS1saXN0XCI+JztcbiAgICBmb3IgKGNvbnN0IGYgb2Ygc3RhdGUuYmF0Y2hGaWxlcykge1xuICAgICAgY29uc3QgbmFtZSA9IGYuc3BsaXQoJy8nKS5wb3AoKSEuc3BsaXQoJ1xcXFwnKS5wb3AoKSE7XG4gICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYmF0Y2gtZmlsZVwiPiR7ZXNjYXBlSHRtbChuYW1lKX08L2Rpdj5gO1xuICAgIH1cbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICB9XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gT3V0cHV0IGRpcmVjdG9yeVxuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtc2VjdGlvblwiPic7XG4gIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJiYXRjaC1yb3dcIj48c3BhbiBjbGFzcz1cImJhdGNoLWxhYmVsXCI+T3V0cHV0PC9zcGFuPjxzcGFuIGNsYXNzPVwiYmF0Y2gtdmFsdWVcIj4ke3N0YXRlLmJhdGNoT3V0cHV0RGlyID8gZXNjYXBlSHRtbChzdGF0ZS5iYXRjaE91dHB1dERpci5zcGxpdCgnLycpLnBvcCgpIS5zcGxpdCgnXFxcXCcpLnBvcCgpISkgOiAnbm90IHNldCd9PC9zcGFuPmA7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJiYXRjaC1idG5cIiBpZD1cImJhdGNoLWNob29zZS1kaXJcIiR7c3RhdGUuYmF0Y2hSdW5uaW5nID8gJyBkaXNhYmxlZCcgOiAnJ30+Q2hvb3NlIEZvbGRlcjwvYnV0dG9uPmA7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gUnVuIGJ1dHRvblxuICBjb25zdCBjYW5SdW4gPSBzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA+IDAgJiYgc3RhdGUuYmF0Y2hPdXRwdXREaXIgJiYgIXN0YXRlLmJhdGNoUnVubmluZztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLXNlY3Rpb25cIj4nO1xuICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1wcmltYXJ5XCIgaWQ9XCJiYXRjaC1ydW5cIiR7Y2FuUnVuID8gJycgOiAnIGRpc2FibGVkJ30+UHJvY2VzcyBBbGw8L2J1dHRvbj5gO1xuICBodG1sICs9ICc8L2Rpdj4nO1xuXG4gIC8vIFByb2dyZXNzXG4gIGlmIChzdGF0ZS5iYXRjaFByb2dyZXNzKSB7XG4gICAgY29uc3QgcGN0ID0gTWF0aC5yb3VuZCgoc3RhdGUuYmF0Y2hQcm9ncmVzcy5jdXJyZW50IC8gc3RhdGUuYmF0Y2hQcm9ncmVzcy50b3RhbCkgKiAxMDApO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJiYXRjaC1zZWN0aW9uXCI+JztcbiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYmF0Y2gtcHJvZ3Jlc3MtaW5mb1wiPiR7c3RhdGUuYmF0Y2hQcm9ncmVzcy5jdXJyZW50fS8ke3N0YXRlLmJhdGNoUHJvZ3Jlc3MudG90YWx9ICZtZGFzaDsgJHtlc2NhcGVIdG1sKHN0YXRlLmJhdGNoUHJvZ3Jlc3MuZmlsZW5hbWUpfTwvZGl2PmA7XG4gICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImJhdGNoLXByb2dyZXNzLWJhclwiPjxkaXYgY2xhc3M9XCJiYXRjaC1wcm9ncmVzcy1maWxsXCIgc3R5bGU9XCJ3aWR0aDoke3BjdH0lXCI+PC9kaXY+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICB9XG5cbiAgLy8gUmVzdWx0c1xuICBpZiAoc3RhdGUuYmF0Y2hSZXN1bHQpIHtcbiAgICBjb25zdCByID0gc3RhdGUuYmF0Y2hSZXN1bHQ7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImJhdGNoLXNlY3Rpb25cIj4nO1xuICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJiYXRjaC1yZXN1bHQtc3VtbWFyeVwiPiR7ci5zdWNjZWVkZWR9IHN1Y2NlZWRlZGA7XG4gICAgaWYgKHIuZmFpbGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGh0bWwgKz0gYCwgPHNwYW4gY2xhc3M9XCJiYXRjaC1yZXN1bHQtZmFpbGVkXCI+JHtyLmZhaWxlZC5sZW5ndGh9IGZhaWxlZDwvc3Bhbj5gO1xuICAgIH1cbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICAgIGlmIChyLmZhaWxlZC5sZW5ndGggPiAwKSB7XG4gICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiYmF0Y2gtZXJyb3JzXCI+JztcbiAgICAgIGZvciAoY29uc3QgZiBvZiByLmZhaWxlZCkge1xuICAgICAgICBjb25zdCBuYW1lID0gZi5wYXRoLnNwbGl0KCcvJykucG9wKCkhLnNwbGl0KCdcXFxcJykucG9wKCkhO1xuICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYmF0Y2gtZXJyb3JcIj4ke2VzY2FwZUh0bWwobmFtZSl9OiAke2VzY2FwZUh0bWwoZi5lcnJvcil9PC9kaXY+YDtcbiAgICAgIH1cbiAgICAgIGh0bWwgKz0gJzwvZGl2Pic7XG4gICAgfVxuICAgIGh0bWwgKz0gJzwvZGl2Pic7XG4gIH1cblxuICBlbC5pbm5lckhUTUwgPSBodG1sO1xufVxuXG5hc3luYyBmdW5jdGlvbiBiYXRjaEFkZEZpbGVzKCk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wZW5EaWFsb2coe1xuICAgICAgbXVsdGlwbGU6IHRydWUsXG4gICAgICBmaWx0ZXJzOiBbe1xuICAgICAgICBuYW1lOiAnSW1hZ2VzJyxcbiAgICAgICAgZXh0ZW5zaW9uczogWydwbmcnLCAnanBnJywgJ2pwZWcnLCAnZ2lmJywgJ3dlYnAnLCAnYm1wJ10sXG4gICAgICB9XSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAvLyByZXN1bHQgbWF5IGJlIGEgc3RyaW5nIG9yIGFycmF5IGRlcGVuZGluZyBvbiBzZWxlY3Rpb25cbiAgICAgIGNvbnN0IHBhdGhzID0gQXJyYXkuaXNBcnJheShyZXN1bHQpID8gcmVzdWx0IDogW3Jlc3VsdF07XG4gICAgICAvLyBBZGQgdG8gZXhpc3RpbmcgbGlzdCwgZGVkdXBcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gbmV3IFNldChzdGF0ZS5iYXRjaEZpbGVzKTtcbiAgICAgIGZvciAoY29uc3QgcCBvZiBwYXRocykge1xuICAgICAgICBpZiAocCAmJiAhZXhpc3RpbmcuaGFzKHApKSB7XG4gICAgICAgICAgc3RhdGUuYmF0Y2hGaWxlcy5wdXNoKHApO1xuICAgICAgICAgIGV4aXN0aW5nLmFkZChwKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmVuZGVyQmF0Y2goKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yOiAnICsgZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYmF0Y2hDaG9vc2VEaXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlbkRpYWxvZyh7XG4gICAgICBkaXJlY3Rvcnk6IHRydWUsXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgc3RhdGUuYmF0Y2hPdXRwdXREaXIgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XG4gICAgICByZW5kZXJCYXRjaCgpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnRXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBiYXRjaFJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKHN0YXRlLmJhdGNoUnVubmluZyB8fCBzdGF0ZS5iYXRjaEZpbGVzLmxlbmd0aCA9PT0gMCB8fCAhc3RhdGUuYmF0Y2hPdXRwdXREaXIpIHJldHVybjtcbiAgc3RhdGUuYmF0Y2hSdW5uaW5nID0gdHJ1ZTtcbiAgc3RhdGUuYmF0Y2hSZXN1bHQgPSBudWxsO1xuICBzdGF0ZS5iYXRjaFByb2dyZXNzID0geyBjdXJyZW50OiAwLCB0b3RhbDogc3RhdGUuYmF0Y2hGaWxlcy5sZW5ndGgsIGZpbGVuYW1lOiAnJyB9O1xuICByZW5kZXJCYXRjaCgpO1xuICBzZXRTdGF0dXMoJ0JhdGNoIHByb2Nlc3NpbmcuLi4nLCAncHJvY2Vzc2luZycpO1xuXG4gIC8vIExpc3RlbiBmb3IgcHJvZ3Jlc3MgZXZlbnRzXG4gIGNvbnN0IHVubGlzdGVuID0gYXdhaXQgd2luZG93Ll9fVEFVUklfXy5ldmVudC5saXN0ZW4oJ2JhdGNoLXByb2dyZXNzJywgKGV2ZW50OiB7IHBheWxvYWQ6IHsgY3VycmVudDogbnVtYmVyOyB0b3RhbDogbnVtYmVyOyBmaWxlbmFtZTogc3RyaW5nIH0gfSkgPT4ge1xuICAgIHN0YXRlLmJhdGNoUHJvZ3Jlc3MgPSBldmVudC5wYXlsb2FkO1xuICAgIHJlbmRlckJhdGNoKCk7XG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlPHsgc3VjY2VlZGVkOiBudW1iZXI7IGZhaWxlZDogeyBwYXRoOiBzdHJpbmc7IGVycm9yOiBzdHJpbmcgfVtdIH0+KCdiYXRjaF9wcm9jZXNzJywge1xuICAgICAgaW5wdXRQYXRoczogc3RhdGUuYmF0Y2hGaWxlcyxcbiAgICAgIG91dHB1dERpcjogc3RhdGUuYmF0Y2hPdXRwdXREaXIsXG4gICAgICBwYzogYnVpbGRQcm9jZXNzQ29uZmlnKCksXG4gICAgICBvdmVyd3JpdGU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHN0YXRlLmJhdGNoUmVzdWx0ID0gcmVzdWx0O1xuICAgIHNldFN0YXR1cyhgQmF0Y2ggZG9uZTogJHtyZXN1bHQuc3VjY2VlZGVkfSBzdWNjZWVkZWQsICR7cmVzdWx0LmZhaWxlZC5sZW5ndGh9IGZhaWxlZGAsIHJlc3VsdC5mYWlsZWQubGVuZ3RoID4gMCA/ICdlcnJvcicgOiAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc2V0U3RhdHVzKCdCYXRjaCBlcnJvcjogJyArIGUsICdlcnJvcicpO1xuICB9IGZpbmFsbHkge1xuICAgIHN0YXRlLmJhdGNoUnVubmluZyA9IGZhbHNlO1xuICAgIHN0YXRlLmJhdGNoUHJvZ3Jlc3MgPSBudWxsO1xuICAgIGlmICh0eXBlb2YgdW5saXN0ZW4gPT09ICdmdW5jdGlvbicpIHVubGlzdGVuKCk7XG4gICAgcmVuZGVyQmF0Y2goKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNoZWV0IHRhYlxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHJlbmRlclNoZWV0KCk6IHZvaWQge1xuICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC1jb250ZW50JykhO1xuICBjb25zdCBzYyA9IHN0YXRlLnNoZWV0Q29uZmlnO1xuICBjb25zdCBkaXMgPSBzdGF0ZS5zaGVldFByb2Nlc3NpbmcgPyAnIGRpc2FibGVkJyA6ICcnO1xuICBsZXQgaHRtbCA9ICcnO1xuXG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXRpdGxlXCI+U3ByaXRlIFNoZWV0IFByb2Nlc3Npbmc8L2Rpdj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtZGVzY1wiPlNwbGl0IGEgc3ByaXRlIHNoZWV0IGludG8gaW5kaXZpZHVhbCB0aWxlcywgcnVuIHRoZSBub3JtYWxpemUgcGlwZWxpbmUgb24gZWFjaCBvbmUsIHRoZW4gcmVhc3NlbWJsZSBpbnRvIGEgY2xlYW4gc2hlZXQuIFlvdSBjYW4gYWxzbyBleHBvcnQgZWFjaCB0aWxlIGFzIGEgc2VwYXJhdGUgZmlsZSBvciBnZW5lcmF0ZSBhbiBhbmltYXRlZCBHSUYuPC9kaXY+JztcbiAgaWYgKCFzdGF0ZS5pbWFnZUxvYWRlZCkge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1kZXNjXCIgc3R5bGU9XCJjb2xvcjp2YXIoLS15ZWxsb3cpO21hcmdpbi10b3A6NnB4XCI+TG9hZCBhbiBpbWFnZSBmaXJzdCBpbiB0aGUgUHJldmlldyB0YWIuPC9kaXY+JztcbiAgfVxuICBodG1sICs9ICc8L2Rpdj4nO1xuXG4gIC8vIE1vZGUgdG9nZ2xlXG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206NHB4XCI+U3BsaXQgTW9kZTwvZGl2Pic7XG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1tb2RlLXRvZ2dsZVwiPic7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJzaGVldC1tb2RlLWJ0biR7c3RhdGUuc2hlZXRNb2RlID09PSAnZml4ZWQnID8gJyBhY3RpdmUnIDogJyd9XCIgZGF0YS1tb2RlPVwiZml4ZWRcIj5GaXhlZCBHcmlkPC9idXR0b24+YDtcbiAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cInNoZWV0LW1vZGUtYnRuJHtzdGF0ZS5zaGVldE1vZGUgPT09ICdhdXRvJyA/ICcgYWN0aXZlJyA6ICcnfVwiIGRhdGEtbW9kZT1cImF1dG9cIj5BdXRvLVNwbGl0PC9idXR0b24+YDtcbiAgaHRtbCArPSAnPC9kaXY+JztcbiAgaWYgKHN0YXRlLnNoZWV0TW9kZSA9PT0gJ2ZpeGVkJykge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+VXNlIHdoZW4geW91ciBzaGVldCBoYXMgYSB1bmlmb3JtIGdyaWQgJm1kYXNoOyBhbGwgdGlsZXMgYXJlIHRoZSBzYW1lIHNpemUgd2l0aCBjb25zaXN0ZW50IHNwYWNpbmcuPC9kaXY+JztcbiAgfSBlbHNlIHtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPlVzZSB3aGVuIHRpbGVzIGFyZSBkaWZmZXJlbnQgc2l6ZXMgb3IgaXJyZWd1bGFybHkgcGxhY2VkLiBEZXRlY3RzIHNwcml0ZXMgYXV0b21hdGljYWxseSBieSBmaW5kaW5nIHNlcGFyYXRvciByb3dzL2NvbHVtbnMuIDxzdHJvbmc+U3ByaXRlcyBtdXN0IGJlIG9uIGEgcHVyZSB3aGl0ZSBiYWNrZ3JvdW5kLjwvc3Ryb25nPjwvZGl2Pic7XG4gIH1cbiAgaHRtbCArPSAnPC9kaXY+JztcblxuICAvLyBNb2RlLXNwZWNpZmljIHNldHRpbmdzXG4gIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgaWYgKHN0YXRlLnNoZWV0TW9kZSA9PT0gJ2ZpeGVkJykge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+VGlsZSBXaWR0aDwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtdHdcIiB2YWx1ZT1cIiR7c2MudGlsZVdpZHRoID8/ICcnfVwiIHBsYWNlaG9sZGVyPVwicHhcIiR7ZGlzfT48L2Rpdj5gO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+V2lkdGggb2YgZWFjaCB0aWxlIGluIHBpeGVscy4gUmVxdWlyZWQuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+VGlsZSBIZWlnaHQ8L3NwYW4+JztcbiAgICBodG1sICs9IGA8aW5wdXQgY2xhc3M9XCJzaGVldC1pbnB1dFwiIHR5cGU9XCJudW1iZXJcIiBpZD1cInNoZWV0LXRoXCIgdmFsdWU9XCIke3NjLnRpbGVIZWlnaHQgPz8gJyd9XCIgcGxhY2Vob2xkZXI9XCJweFwiJHtkaXN9PjwvZGl2PmA7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5IZWlnaHQgb2YgZWFjaCB0aWxlIGluIHBpeGVscy4gUmVxdWlyZWQuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+U3BhY2luZzwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtc3BcIiB2YWx1ZT1cIiR7c2Muc3BhY2luZ31cIiBwbGFjZWhvbGRlcj1cIjBcIiR7ZGlzfT48L2Rpdj5gO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+R2FwIGJldHdlZW4gdGlsZXMgaW4gcGl4ZWxzLiBTZXQgdG8gMCBpZiB0aWxlcyBhcmUgcGFja2VkIGVkZ2UtdG8tZWRnZS48L2Rpdj4nO1xuXG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5NYXJnaW48L3NwYW4+JztcbiAgICBodG1sICs9IGA8aW5wdXQgY2xhc3M9XCJzaGVldC1pbnB1dFwiIHR5cGU9XCJudW1iZXJcIiBpZD1cInNoZWV0LW1nXCIgdmFsdWU9XCIke3NjLm1hcmdpbn1cIiBwbGFjZWhvbGRlcj1cIjBcIiR7ZGlzfT48L2Rpdj5gO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1oZWxwXCI+Qm9yZGVyIGFyb3VuZCB0aGUgZW50aXJlIHNoZWV0IGluIHBpeGVscy4gVXN1YWxseSAwLjwvZGl2Pic7XG4gIH0gZWxzZSB7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5TZXAuIFRocmVzaG9sZDwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtc2VwXCIgdmFsdWU9XCIke3NjLnNlcGFyYXRvclRocmVzaG9sZH1cIiBzdGVwPVwiMC4wNVwiIG1pbj1cIjBcIiBtYXg9XCIxXCIke2Rpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPkhvdyB1bmlmb3JtIGEgcm93L2NvbHVtbiBtdXN0IGJlIHRvIGNvdW50IGFzIGEgc2VwYXJhdG9yICgwJm5kYXNoOzEpLiBIaWdoZXIgPSBzdHJpY3Rlci4gMC45MCB3b3JrcyBmb3IgbW9zdCBzaGVldHMuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+TWluIFNwcml0ZSBTaXplPC9zcGFuPic7XG4gICAgaHRtbCArPSBgPGlucHV0IGNsYXNzPVwic2hlZXQtaW5wdXRcIiB0eXBlPVwibnVtYmVyXCIgaWQ9XCJzaGVldC1taW5cIiB2YWx1ZT1cIiR7c2MubWluU3ByaXRlU2l6ZX1cIiBtaW49XCIxXCIke2Rpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPklnbm9yZSBkZXRlY3RlZCByZWdpb25zIHNtYWxsZXIgdGhhbiB0aGlzIG1hbnkgcGl4ZWxzLiBGaWx0ZXJzIG91dCBub2lzZSBhbmQgdGlueSBmcmFnbWVudHMuPC9kaXY+JztcblxuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZXR0aW5nXCI+PHNwYW4gY2xhc3M9XCJzaGVldC1zZXR0aW5nLWxhYmVsXCI+UGFkZGluZzwvc3Bhbj4nO1xuICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwic2hlZXQtcGFkXCIgdmFsdWU9XCIke3NjLnBhZH1cIiBtaW49XCIwXCIke2Rpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPkV4dHJhIHBpeGVscyB0byBpbmNsdWRlIGFyb3VuZCBlYWNoIGRldGVjdGVkIHNwcml0ZS4gVXNlZnVsIGlmIGF1dG8tZGV0ZWN0aW9uIGNyb3BzIHRvbyB0aWdodGx5LjwvZGl2Pic7XG4gIH1cbiAgaHRtbCArPSAnPC9kaXY+JztcblxuICAvLyBTa2lwIG5vcm1hbGl6ZSB0b2dnbGVcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNlY3Rpb25cIj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtc2V0dGluZ1wiPjxzcGFuIGNsYXNzPVwic2hlZXQtc2V0dGluZy1sYWJlbFwiPlNraXAgTm9ybWFsaXplPC9zcGFuPic7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJiYXRjaC1idG4gYmF0Y2gtYnRuLWRpbVwiIGlkPVwic2hlZXQtbm8tbm9ybWFsaXplXCIgc3R5bGU9XCJtaW4td2lkdGg6NDBweFwiJHtkaXN9PiR7c2Mubm9Ob3JtYWxpemUgPyAnb24nIDogJ29mZid9PC9idXR0b24+PC9kaXY+YDtcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5XaGVuIG9uLCB0aWxlcyBhcmUgc3BsaXQgYW5kIHJlYXNzZW1ibGVkIHdpdGhvdXQgcnVubmluZyB0aGUgcGlwZWxpbmUuIFVzZWZ1bCBmb3IganVzdCBleHRyYWN0aW5nIG9yIHJlYXJyYW5naW5nIHRpbGVzLjwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gQWN0aW9uIGJ1dHRvbnNcbiAgY29uc3QgY2FuQWN0ID0gc3RhdGUuaW1hZ2VMb2FkZWQgJiYgIXN0YXRlLnNoZWV0UHJvY2Vzc2luZztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNlY3Rpb25cIj4nO1xuICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtYWN0aW9uc1wiPic7XG4gIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJiYXRjaC1idG5cIiBpZD1cInNoZWV0LXByZXZpZXctYnRuXCIke2NhbkFjdCA/ICcnIDogJyBkaXNhYmxlZCd9PlByZXZpZXcgU3BsaXQ8L2J1dHRvbj5gO1xuICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1wcmltYXJ5XCIgaWQ9XCJzaGVldC1wcm9jZXNzLWJ0blwiJHtjYW5BY3QgPyAnJyA6ICcgZGlzYWJsZWQnfT5Qcm9jZXNzIFNoZWV0PC9idXR0b24+YDtcbiAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cImJhdGNoLWJ0blwiIGlkPVwic2hlZXQtc2F2ZS10aWxlcy1idG5cIiR7c3RhdGUuc2hlZXRQcmV2aWV3ICYmICFzdGF0ZS5zaGVldFByb2Nlc3NpbmcgPyAnJyA6ICcgZGlzYWJsZWQnfT5TYXZlIFRpbGVzPC9idXR0b24+YDtcbiAgaHRtbCArPSAnPC9kaXY+JztcbiAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj48c3Ryb25nPlByZXZpZXcgU3BsaXQ8L3N0cm9uZz4gc2hvd3MgaG93IG1hbnkgdGlsZXMgd2lsbCBiZSBleHRyYWN0ZWQuIDxzdHJvbmc+UHJvY2VzcyBTaGVldDwvc3Ryb25nPiBydW5zIHRoZSBub3JtYWxpemUgcGlwZWxpbmUgb24gZWFjaCB0aWxlIGFuZCByZWFzc2VtYmxlcy4gPHN0cm9uZz5TYXZlIFRpbGVzPC9zdHJvbmc+IGV4cG9ydHMgZWFjaCB0aWxlIGFzIGEgc2VwYXJhdGUgUE5HLjwvZGl2Pic7XG4gIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgLy8gUHJldmlldyBpbmZvXG4gIGlmIChzdGF0ZS5zaGVldFByZXZpZXcpIHtcbiAgICBjb25zdCBwID0gc3RhdGUuc2hlZXRQcmV2aWV3O1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2hlZXQtaW5mb1wiPiR7cC50aWxlQ291bnR9IHRpbGVzICZtZGFzaDsgJHtwLmNvbHN9XFx1MDBkNyR7cC5yb3dzfSBncmlkICZtZGFzaDsgJHtwLnRpbGVXaWR0aH1cXHUwMGQ3JHtwLnRpbGVIZWlnaHR9cHggZWFjaDwvZGl2PmA7XG4gICAgaHRtbCArPSAnPC9kaXY+JztcblxuICAgIC8vIEdJRiBhbmltYXRpb24gc2VjdGlvblxuICAgIGNvbnN0IGdpZkRpcyA9IHN0YXRlLmdpZkdlbmVyYXRpbmcgPyAnIGRpc2FibGVkJyA6ICcnO1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+JztcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtdGl0bGVcIiBzdHlsZT1cIm1hcmdpbi10b3A6NHB4XCI+R0lGIEFuaW1hdGlvbjwvZGl2Pic7XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5HZW5lcmF0ZSBhbiBhbmltYXRlZCBHSUYgZnJvbSB0aGUgcHJvY2Vzc2VkIHRpbGVzLiBQcmV2aWV3IGl0IGhlcmUgb3IgZXhwb3J0IHRvIGEgZmlsZS48L2Rpdj4nO1xuXG4gICAgLy8gTW9kZSB0b2dnbGVcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtc2V0dGluZ1wiPjxzcGFuIGNsYXNzPVwic2hlZXQtc2V0dGluZy1sYWJlbFwiPkFuaW1hdGU8L3NwYW4+JztcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtbW9kZS10b2dnbGVcIj4nO1xuICAgIGh0bWwgKz0gYDxidXR0b24gY2xhc3M9XCJzaGVldC1tb2RlLWJ0biBnaWYtbW9kZS1idG4ke3N0YXRlLmdpZk1vZGUgPT09ICdyb3cnID8gJyBhY3RpdmUnIDogJyd9XCIgZGF0YS1naWYtbW9kZT1cInJvd1wiJHtnaWZEaXN9PkJ5IFJvdzwvYnV0dG9uPmA7XG4gICAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cInNoZWV0LW1vZGUtYnRuIGdpZi1tb2RlLWJ0biR7c3RhdGUuZ2lmTW9kZSA9PT0gJ2FsbCcgPyAnIGFjdGl2ZScgOiAnJ31cIiBkYXRhLWdpZi1tb2RlPVwiYWxsXCIke2dpZkRpc30+RW50aXJlIFNoZWV0PC9idXR0b24+YDtcbiAgICBodG1sICs9ICc8L2Rpdj48L2Rpdj4nO1xuXG4gICAgLy8gUm93IHNlbGVjdG9yIChyb3cgbW9kZSBvbmx5KVxuICAgIGlmIChzdGF0ZS5naWZNb2RlID09PSAncm93Jykge1xuICAgICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5Sb3c8L3NwYW4+JztcbiAgICAgIGh0bWwgKz0gYDxpbnB1dCBjbGFzcz1cInNoZWV0LWlucHV0XCIgdHlwZT1cIm51bWJlclwiIGlkPVwiZ2lmLXJvd1wiIHZhbHVlPVwiJHtzdGF0ZS5naWZSb3d9XCIgbWluPVwiMFwiIG1heD1cIiR7cC5yb3dzIC0gMX1cIiR7Z2lmRGlzfT48L2Rpdj5gO1xuICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNoZWV0LWhlbHBcIj5XaGljaCByb3cgdG8gYW5pbWF0ZSAoMFxcdTIwMTMke3Aucm93cyAtIDF9KS4gRWFjaCByb3cgYmVjb21lcyBvbmUgYW5pbWF0aW9uIHNlcXVlbmNlLjwvZGl2PmA7XG4gICAgfVxuXG4gICAgLy8gRlBTIGlucHV0XG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LXNldHRpbmdcIj48c3BhbiBjbGFzcz1cInNoZWV0LXNldHRpbmctbGFiZWxcIj5GcmFtZSBSYXRlPC9zcGFuPic7XG4gICAgaHRtbCArPSBgPGlucHV0IGNsYXNzPVwic2hlZXQtaW5wdXRcIiB0eXBlPVwibnVtYmVyXCIgaWQ9XCJnaWYtZnBzXCIgdmFsdWU9XCIke3N0YXRlLmdpZkZwc31cIiBtaW49XCIxXCIgbWF4PVwiMTAwXCIke2dpZkRpc30+PC9kaXY+YDtcbiAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaGVscFwiPkZyYW1lcyBwZXIgc2Vjb25kICgxXFx1MjAxMzEwMCkuIDEwIGZwcyBpcyBhIGdvb2QgZGVmYXVsdCBmb3IgcGl4ZWwgYXJ0IGFuaW1hdGlvbnMuPC9kaXY+JztcblxuICAgIC8vIEFjdGlvbiBidXR0b25zXG4gICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInNoZWV0LWFjdGlvbnNcIiBzdHlsZT1cIm1hcmdpbi10b3A6NHB4XCI+JztcbiAgICBodG1sICs9IGA8YnV0dG9uIGNsYXNzPVwiYmF0Y2gtYnRuIGJhdGNoLWJ0bi1wcmltYXJ5XCIgaWQ9XCJnaWYtcHJldmlldy1idG5cIiR7Z2lmRGlzfT5QcmV2aWV3IEdJRjwvYnV0dG9uPmA7XG4gICAgaHRtbCArPSBgPGJ1dHRvbiBjbGFzcz1cImJhdGNoLWJ0blwiIGlkPVwiZ2lmLWV4cG9ydC1idG5cIiR7c3RhdGUuZ2lmUHJldmlld1VybCAmJiAhc3RhdGUuZ2lmR2VuZXJhdGluZyA/ICcnIDogJyBkaXNhYmxlZCd9PkV4cG9ydCBHSUY8L2J1dHRvbj5gO1xuICAgIGh0bWwgKz0gJzwvZGl2Pic7XG5cbiAgICAvLyBHZW5lcmF0aW5nIGluZGljYXRvclxuICAgIGlmIChzdGF0ZS5naWZHZW5lcmF0aW5nKSB7XG4gICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwic2hlZXQtaW5mb1wiIHN0eWxlPVwiY29sb3I6dmFyKC0tbWF1dmUpO21hcmdpbi10b3A6NnB4XCI+R2VuZXJhdGluZyBHSUYuLi48L2Rpdj4nO1xuICAgIH1cblxuICAgIC8vIFByZXZpZXcgYXJlYVxuICAgIGlmIChzdGF0ZS5naWZQcmV2aWV3VXJsKSB7XG4gICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwiZ2lmLXByZXZpZXctY29udGFpbmVyXCI+JztcbiAgICAgIGh0bWwgKz0gYDxpbWcgY2xhc3M9XCJnaWYtcHJldmlldy1pbWdcIiBzcmM9XCIke3N0YXRlLmdpZlByZXZpZXdVcmx9XCIgYWx0PVwiR0lGIFByZXZpZXdcIj5gO1xuICAgICAgaHRtbCArPSAnPC9kaXY+JztcbiAgICB9XG5cbiAgICBodG1sICs9ICc8L2Rpdj4nO1xuICB9XG5cbiAgaWYgKHN0YXRlLnNoZWV0UHJvY2Vzc2luZykge1xuICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJzaGVldC1zZWN0aW9uXCI+PGRpdiBjbGFzcz1cInNoZWV0LWluZm9cIiBzdHlsZT1cImNvbG9yOnZhcigtLW1hdXZlKVwiPlByb2Nlc3NpbmcuLi48L2Rpdj48L2Rpdj4nO1xuICB9XG5cbiAgZWwuaW5uZXJIVE1MID0gaHRtbDtcbn1cblxuZnVuY3Rpb24gcmVhZFNoZWV0Q29uZmlnKCk6IHZvaWQge1xuICBjb25zdCBzYyA9IHN0YXRlLnNoZWV0Q29uZmlnO1xuICBpZiAoc3RhdGUuc2hlZXRNb2RlID09PSAnZml4ZWQnKSB7XG4gICAgY29uc3QgdHcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hlZXQtdHcnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBjb25zdCB0aCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC10aCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHNwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NoZWV0LXNwJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgbWcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hlZXQtbWcnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodHcpIHsgY29uc3QgdiA9IHBhcnNlSW50KHR3LnZhbHVlKTsgc2MudGlsZVdpZHRoID0gaXNOYU4odikgfHwgdiA8IDEgPyBudWxsIDogdjsgfVxuICAgIGlmICh0aCkgeyBjb25zdCB2ID0gcGFyc2VJbnQodGgudmFsdWUpOyBzYy50aWxlSGVpZ2h0ID0gaXNOYU4odikgfHwgdiA8IDEgPyBudWxsIDogdjsgfVxuICAgIGlmIChzcCkgeyBjb25zdCB2ID0gcGFyc2VJbnQoc3AudmFsdWUpOyBzYy5zcGFjaW5nID0gaXNOYU4odikgPyAwIDogTWF0aC5tYXgoMCwgdik7IH1cbiAgICBpZiAobWcpIHsgY29uc3QgdiA9IHBhcnNlSW50KG1nLnZhbHVlKTsgc2MubWFyZ2luID0gaXNOYU4odikgPyAwIDogTWF0aC5tYXgoMCwgdik7IH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBzZXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hlZXQtc2VwJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgbWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NoZWV0LW1pbicpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHBhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC1wYWQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoc2VwKSB7IGNvbnN0IHYgPSBwYXJzZUZsb2F0KHNlcC52YWx1ZSk7IHNjLnNlcGFyYXRvclRocmVzaG9sZCA9IGlzTmFOKHYpID8gMC45MCA6IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHYpKTsgfVxuICAgIGlmIChtaW4pIHsgY29uc3QgdiA9IHBhcnNlSW50KG1pbi52YWx1ZSk7IHNjLm1pblNwcml0ZVNpemUgPSBpc05hTih2KSA/IDggOiBNYXRoLm1heCgxLCB2KTsgfVxuICAgIGlmIChwYWQpIHsgY29uc3QgdiA9IHBhcnNlSW50KHBhZC52YWx1ZSk7IHNjLnBhZCA9IGlzTmFOKHYpID8gMCA6IE1hdGgubWF4KDAsIHYpOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRTaGVldEFyZ3MoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICBjb25zdCBzYyA9IHN0YXRlLnNoZWV0Q29uZmlnO1xuICByZXR1cm4ge1xuICAgIG1vZGU6IHN0YXRlLnNoZWV0TW9kZSxcbiAgICB0aWxlV2lkdGg6IHNjLnRpbGVXaWR0aCxcbiAgICB0aWxlSGVpZ2h0OiBzYy50aWxlSGVpZ2h0LFxuICAgIHNwYWNpbmc6IHNjLnNwYWNpbmcsXG4gICAgbWFyZ2luOiBzYy5tYXJnaW4sXG4gICAgc2VwYXJhdG9yVGhyZXNob2xkOiBzYy5zZXBhcmF0b3JUaHJlc2hvbGQsXG4gICAgbWluU3ByaXRlU2l6ZTogc2MubWluU3ByaXRlU2l6ZSxcbiAgICBwYWQ6IHNjLnBhZCxcbiAgICBub05vcm1hbGl6ZTogc2Mubm9Ob3JtYWxpemUgfHwgbnVsbCxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hlZXRQcmV2aWV3QWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIXN0YXRlLmltYWdlTG9hZGVkIHx8IHN0YXRlLnNoZWV0UHJvY2Vzc2luZykgcmV0dXJuO1xuICByZWFkU2hlZXRDb25maWcoKTtcbiAgc3RhdGUuc2hlZXRQcm9jZXNzaW5nID0gdHJ1ZTtcbiAgcmVuZGVyU2hlZXQoKTtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2U8eyB0aWxlQ291bnQ6IG51bWJlcjsgdGlsZVdpZHRoOiBudW1iZXI7IHRpbGVIZWlnaHQ6IG51bWJlcjsgY29sczogbnVtYmVyOyByb3dzOiBudW1iZXIgfT4oJ3NoZWV0X3ByZXZpZXcnLCBidWlsZFNoZWV0QXJncygpKTtcbiAgICBzdGF0ZS5zaGVldFByZXZpZXcgPSByZXN1bHQ7XG4gICAgc2V0U3RhdHVzKGBTaGVldDogJHtyZXN1bHQudGlsZUNvdW50fSB0aWxlcyAoJHtyZXN1bHQuY29sc31cXHUwMGQ3JHtyZXN1bHQucm93c30pYCwgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnU2hlZXQgZXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgICBzdGF0ZS5zaGVldFByZXZpZXcgPSBudWxsO1xuICB9IGZpbmFsbHkge1xuICAgIHN0YXRlLnNoZWV0UHJvY2Vzc2luZyA9IGZhbHNlO1xuICAgIHJlbmRlclNoZWV0KCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hlZXRQcm9jZXNzQWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIXN0YXRlLmltYWdlTG9hZGVkIHx8IHN0YXRlLnNoZWV0UHJvY2Vzc2luZykgcmV0dXJuO1xuICByZWFkU2hlZXRDb25maWcoKTtcbiAgc3RhdGUuc2hlZXRQcm9jZXNzaW5nID0gdHJ1ZTtcbiAgc3RhdGUuZ2lmUHJldmlld1VybCA9IG51bGw7XG4gIHJlbmRlclNoZWV0KCk7XG4gIHNldFN0YXR1cygnUHJvY2Vzc2luZyBzaGVldC4uLicsICdwcm9jZXNzaW5nJyk7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIHRyeSB7XG4gICAgY29uc3QgYXJncyA9IHsgLi4uYnVpbGRTaGVldEFyZ3MoKSwgcGM6IGJ1aWxkUHJvY2Vzc0NvbmZpZygpIH07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlPHsgdGlsZUNvdW50OiBudW1iZXI7IHRpbGVXaWR0aDogbnVtYmVyOyB0aWxlSGVpZ2h0OiBudW1iZXI7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyOyBvdXRwdXRXaWR0aDogbnVtYmVyOyBvdXRwdXRIZWlnaHQ6IG51bWJlciB9Pignc2hlZXRfcHJvY2VzcycsIGFyZ3MpO1xuICAgIHN0YXRlLnNoZWV0UHJldmlldyA9IHJlc3VsdDtcblxuICAgIC8vIFVwZGF0ZSBwcmV2aWV3IHdpdGggdGhlIHByb2Nlc3NlZCBzaGVldFxuICAgIGNvbnN0IHByb2NVcmwgPSBhd2FpdCBsb2FkSW1hZ2VCbG9iKCdwcm9jZXNzZWQnKTtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Byb2Nlc3NlZC1pbWcnKSBhcyBIVE1MSW1hZ2VFbGVtZW50KS5zcmMgPSBwcm9jVXJsO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwcm9jZXNzZWQtZGltcycpIS50ZXh0Q29udGVudCA9IGAke3Jlc3VsdC5vdXRwdXRXaWR0aH1cXHUwMGQ3JHtyZXN1bHQub3V0cHV0SGVpZ2h0fWA7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5ncy1wcmV2aWV3LWltZycpIGFzIEhUTUxJbWFnZUVsZW1lbnQpLnNyYyA9IHByb2NVcmw7XG5cbiAgICBjb25zdCBlbGFwc2VkID0gKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAvIDEwMDApLnRvRml4ZWQoMik7XG4gICAgc2V0U3RhdHVzKGBTaGVldCBwcm9jZXNzZWQ6ICR7cmVzdWx0LnRpbGVDb3VudH0gdGlsZXMsICR7cmVzdWx0Lm91dHB1dFdpZHRofVxcdTAwZDcke3Jlc3VsdC5vdXRwdXRIZWlnaHR9ICgke2VsYXBzZWR9cylgLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc2V0U3RhdHVzKCdTaGVldCBlcnJvcjogJyArIGUsICdlcnJvcicpO1xuICB9IGZpbmFsbHkge1xuICAgIHN0YXRlLnNoZWV0UHJvY2Vzc2luZyA9IGZhbHNlO1xuICAgIHJlbmRlclNoZWV0KCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hlZXRTYXZlVGlsZXNBY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlbkRpYWxvZyh7IGRpcmVjdG9yeTogdHJ1ZSB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBjb25zdCBkaXIgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XG4gICAgICBjb25zdCBjb3VudCA9IGF3YWl0IGludm9rZTxudW1iZXI+KCdzaGVldF9zYXZlX3RpbGVzJywgeyBvdXRwdXREaXI6IGRpciB9KTtcbiAgICAgIHNldFN0YXR1cyhgU2F2ZWQgJHtjb3VudH0gdGlsZXMgdG8gJHtkaXIuc3BsaXQoJy8nKS5wb3AoKSEuc3BsaXQoJ1xcXFwnKS5wb3AoKSF9YCwgJ3N1Y2Nlc3MnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzZXRTdGF0dXMoJ0Vycm9yIHNhdmluZyB0aWxlczogJyArIGUsICdlcnJvcicpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRHaWZDb25maWcoKTogdm9pZCB7XG4gIGNvbnN0IHJvd0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dpZi1yb3cnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgY29uc3QgZnBzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2lmLWZwcycpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBpZiAocm93RWwpIHtcbiAgICBjb25zdCB2ID0gcGFyc2VJbnQocm93RWwudmFsdWUpO1xuICAgIHN0YXRlLmdpZlJvdyA9IGlzTmFOKHYpID8gMCA6IE1hdGgubWF4KDAsIHYpO1xuICB9XG4gIGlmIChmcHNFbCkge1xuICAgIGNvbnN0IHYgPSBwYXJzZUludChmcHNFbC52YWx1ZSk7XG4gICAgc3RhdGUuZ2lmRnBzID0gaXNOYU4odikgPyAxMCA6IE1hdGgubWF4KDEsIE1hdGgubWluKDEwMCwgdikpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdpZlByZXZpZXdBY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmIChzdGF0ZS5naWZHZW5lcmF0aW5nKSByZXR1cm47XG4gIHJlYWRHaWZDb25maWcoKTtcbiAgc3RhdGUuZ2lmR2VuZXJhdGluZyA9IHRydWU7XG4gIHN0YXRlLmdpZlByZXZpZXdVcmwgPSBudWxsO1xuICByZW5kZXJTaGVldCgpO1xuICBzZXRTdGF0dXMoJ0dlbmVyYXRpbmcgR0lGIHByZXZpZXcuLi4nLCAncHJvY2Vzc2luZycpO1xuICB0cnkge1xuICAgIGNvbnN0IGRhdGFVcmwgPSBhd2FpdCBpbnZva2U8c3RyaW5nPignc2hlZXRfZ2VuZXJhdGVfZ2lmJywge1xuICAgICAgbW9kZTogc3RhdGUuZ2lmTW9kZSxcbiAgICAgIHJvdzogc3RhdGUuZ2lmTW9kZSA9PT0gJ3JvdycgPyBzdGF0ZS5naWZSb3cgOiBudWxsLFxuICAgICAgZnBzOiBzdGF0ZS5naWZGcHMsXG4gICAgfSk7XG4gICAgc3RhdGUuZ2lmUHJldmlld1VybCA9IGRhdGFVcmw7XG4gICAgc2V0U3RhdHVzKCdHSUYgcHJldmlldyBnZW5lcmF0ZWQnLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc2V0U3RhdHVzKCdHSUYgZXJyb3I6ICcgKyBlLCAnZXJyb3InKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzdGF0ZS5naWZHZW5lcmF0aW5nID0gZmFsc2U7XG4gICAgcmVuZGVyU2hlZXQoKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnaWZFeHBvcnRBY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghc3RhdGUuZ2lmUHJldmlld1VybCkgcmV0dXJuO1xuICByZWFkR2lmQ29uZmlnKCk7XG4gIHRyeSB7XG4gICAgY29uc3QgZGVmYXVsdE5hbWUgPSBzdGF0ZS5naWZNb2RlID09PSAncm93JyA/IGByb3dfJHtzdGF0ZS5naWZSb3d9LmdpZmAgOiAnYW5pbWF0aW9uLmdpZic7XG4gICAgY29uc3QgcGF0aCA9IGF3YWl0IHNhdmVEaWFsb2coe1xuICAgICAgZmlsdGVyczogW3sgbmFtZTogJ0dJRicsIGV4dGVuc2lvbnM6IFsnZ2lmJ10gfV0sXG4gICAgICBkZWZhdWx0UGF0aDogZGVmYXVsdE5hbWUsXG4gICAgfSk7XG4gICAgaWYgKHBhdGgpIHtcbiAgICAgIHNldFN0YXR1cygnRXhwb3J0aW5nIEdJRi4uLicsICdwcm9jZXNzaW5nJyk7XG4gICAgICBhd2FpdCBpbnZva2UoJ3NoZWV0X2V4cG9ydF9naWYnLCB7XG4gICAgICAgIHBhdGgsXG4gICAgICAgIG1vZGU6IHN0YXRlLmdpZk1vZGUsXG4gICAgICAgIHJvdzogc3RhdGUuZ2lmTW9kZSA9PT0gJ3JvdycgPyBzdGF0ZS5naWZSb3cgOiBudWxsLFxuICAgICAgICBmcHM6IHN0YXRlLmdpZkZwcyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgZm5hbWUgPSAocGF0aCBhcyBzdHJpbmcpLnNwbGl0KCcvJykucG9wKCkhLnNwbGl0KCdcXFxcJykucG9wKCkhO1xuICAgICAgc2V0U3RhdHVzKGBHSUYgc2F2ZWQgdG8gJHtmbmFtZX1gLCAnc3VjY2VzcycpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIHNldFN0YXR1cygnR0lGIGV4cG9ydCBlcnJvcjogJyArIGUsICdlcnJvcicpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVGFiIGNsaWNrIGhhbmRsaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnRhYi1iYXInKSEuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZTogRXZlbnQpID0+IHtcbiAgY29uc3QgdGFiID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudGFiJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAodGFiKSBzd2l0Y2hUYWIodGFiLmRhdGFzZXQudGFiISk7XG59KTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBEcmFnIGFuZCBkcm9wXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgZHJvcE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZHJvcC1vdmVybGF5JykhO1xubGV0IGRyYWdDb3VudGVyID0gMDtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VudGVyJywgKGU6IERyYWdFdmVudCkgPT4ge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIGRyYWdDb3VudGVyKys7XG4gIGRyb3BPdmVybGF5LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xufSk7XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdsZWF2ZScsIChlOiBEcmFnRXZlbnQpID0+IHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICBkcmFnQ291bnRlci0tO1xuICBpZiAoZHJhZ0NvdW50ZXIgPD0gMCkge1xuICAgIGRyYWdDb3VudGVyID0gMDtcbiAgICBkcm9wT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgfVxufSk7XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGU6IERyYWdFdmVudCkgPT4ge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG59KTtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJvcCcsIGFzeW5jIChlOiBEcmFnRXZlbnQpID0+IHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICBkcmFnQ291bnRlciA9IDA7XG4gIGRyb3BPdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXG4gIGNvbnN0IGZpbGVzID0gZS5kYXRhVHJhbnNmZXI/LmZpbGVzO1xuICBpZiAoZmlsZXMgJiYgZmlsZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGZpbGUgPSBmaWxlc1swXSBhcyBGaWxlICYgeyBwYXRoPzogc3RyaW5nIH07XG4gICAgaWYgKGZpbGUucGF0aCkge1xuICAgICAgYXdhaXQgb3BlbkltYWdlKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG59KTtcblxuLy8gVGF1cmkgbmF0aXZlIGZpbGUgZHJvcCBldmVudHNcbmlmICh3aW5kb3cuX19UQVVSSV9fPy5ldmVudCkge1xuICB3aW5kb3cuX19UQVVSSV9fLmV2ZW50Lmxpc3RlbigndGF1cmk6Ly9kcmFnLWRyb3AnLCBhc3luYyAoZXZlbnQ6IFRhdXJpRXZlbnQpID0+IHtcbiAgICBkcm9wT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICBkcmFnQ291bnRlciA9IDA7XG4gICAgY29uc3QgcGF0aHMgPSBldmVudC5wYXlsb2FkPy5wYXRocztcbiAgICBpZiAocGF0aHMgJiYgcGF0aHMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgb3BlbkltYWdlKHBhdGhzWzBdKTtcbiAgICB9XG4gIH0pO1xuXG4gIHdpbmRvdy5fX1RBVVJJX18uZXZlbnQubGlzdGVuKCd0YXVyaTovL2RyYWctZW50ZXInLCAoKSA9PiB7XG4gICAgZHJvcE92ZXJsYXkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gIH0pO1xuXG4gIHdpbmRvdy5fX1RBVVJJX18uZXZlbnQubGlzdGVuKCd0YXVyaTovL2RyYWctbGVhdmUnLCAoKSA9PiB7XG4gICAgZHJvcE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgZHJhZ0NvdW50ZXIgPSAwO1xuICB9KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTZXR0aW5ncyBjbGljayBoYW5kbGluZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5ncy1saXN0JykhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGU6IEV2ZW50KSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXG4gIC8vIENsZWFyIGJ1dHRvbiBjbGljayAow5cgdG8gcmVzZXQgbnVsbGFibGUgc2V0dGluZylcbiAgaWYgKHRhcmdldC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdzZXR0aW5nLWNsZWFyJykgJiYgIXN0YXRlLnByb2Nlc3NpbmcpIHtcbiAgICBza2lwTmV4dEJsdXJDb21taXQgPSB0cnVlO1xuICAgIGNvbnN0IGtleSA9IHRhcmdldC5kYXRhc2V0LmtleSE7XG4gICAgY2xlYXJTZXR0aW5nKGtleSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQm9vbGVhbiBvciBudWxsYWJsZS1vZmYgdG9nZ2xlIGNsaWNrXG4gIGlmICh0YXJnZXQuY2xhc3NMaXN0Py5jb250YWlucygnc2V0dGluZy10b2dnbGUnKSAmJiAhc3RhdGUucHJvY2Vzc2luZykge1xuICAgIGNvbnN0IGtleSA9IHRhcmdldC5kYXRhc2V0LmtleSE7XG4gICAgY29uc3Qgcm93ID0gdGFyZ2V0LmNsb3Nlc3QoJy5zZXR0aW5nLXJvdycpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAocm93KSBzdGF0ZS5zZXR0aW5nc0ZvY3VzSW5kZXggPSBwYXJzZUludChyb3cuZGF0YXNldC5pbmRleCEpO1xuICAgIGlmIChCT09MRUFOX1NFVFRJTkdTLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGFkanVzdFNldHRpbmcoa2V5LCAxKTtcbiAgICAgIHJlbmRlclNldHRpbmdzKCk7XG4gICAgICBhdXRvUHJvY2VzcygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBOdWxsYWJsZSBzZXR0aW5nIGluIFwib2ZmXCIgc3RhdGUg4oCUIGVuYWJsZSBpdFxuICAgICAgc3RhcnRFZGl0aW5nKGtleSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsaWNrIG9uIHJvdyB0byBmb2N1cyBpdFxuICBjb25zdCByb3cgPSB0YXJnZXQuY2xvc2VzdCgnLnNldHRpbmctcm93JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAocm93KSB7XG4gICAgc3RhdGUuc2V0dGluZ3NGb2N1c0luZGV4ID0gcGFyc2VJbnQocm93LmRhdGFzZXQuaW5kZXghKTtcbiAgICByZW5kZXJTZXR0aW5ncygpO1xuICB9XG59KTtcblxuLy8gQ29tbWl0IGlubGluZSBpbnB1dCBvbiBibHVyXG5sZXQgc2tpcE5leHRCbHVyQ29tbWl0ID0gZmFsc2U7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtbGlzdCcpIS5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIChlOiBGb2N1c0V2ZW50KSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICBpZiAodGFyZ2V0LmNsYXNzTGlzdD8uY29udGFpbnMoJ3NldHRpbmctaW5saW5lLWlucHV0JykpIHtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmIChza2lwTmV4dEJsdXJDb21taXQpIHsgc2tpcE5leHRCbHVyQ29tbWl0ID0gZmFsc2U7IHJldHVybjsgfVxuICAgICAgY29tbWl0RWRpdCgodGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmRhdGFzZXQua2V5ISwgKHRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgfSwgNTApO1xuICB9XG59KTtcblxuLy8gQ29tbWl0IHNlbGVjdCBjaGFuZ2VzXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3MtbGlzdCcpIS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZTogRXZlbnQpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gIGlmICh0YXJnZXQudGFnTmFtZSA9PT0gJ1NFTEVDVCcgJiYgdGFyZ2V0LmNsYXNzTGlzdD8uY29udGFpbnMoJ3NldHRpbmctaW5saW5lLXNlbGVjdCcpKSB7XG4gICAgY29tbWl0RWRpdCh0YXJnZXQuZGF0YXNldC5rZXkhLCB0YXJnZXQudmFsdWUpO1xuICB9XG59KTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBJbml0XG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuYXN5bmMgZnVuY3Rpb24gaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBzdGF0ZS5wYWxldHRlcyA9IGF3YWl0IGludm9rZTxQYWxldHRlSW5mb1tdPignbGlzdF9wYWxldHRlcycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgcGFsZXR0ZXM6JywgZSk7XG4gIH1cbiAgcmVuZGVyU2V0dGluZ3MoKTtcbiAgcmVuZGVyRGlhZ25vc3RpY3MoKTtcbiAgcmVuZGVyQmF0Y2goKTtcbiAgcmVuZGVyU2hlZXQoKTtcbn1cblxuLy8gQmF0Y2ggcGFuZWwgY2xpY2sgZGVsZWdhdGlvblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JhdGNoLWNvbnRlbnQnKSEuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZTogRXZlbnQpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gIGlmICh0YXJnZXQuaWQgPT09ICdiYXRjaC1hZGQtZmlsZXMnKSB7IGJhdGNoQWRkRmlsZXMoKTsgcmV0dXJuOyB9XG4gIGlmICh0YXJnZXQuaWQgPT09ICdiYXRjaC1jbGVhci1maWxlcycpIHsgc3RhdGUuYmF0Y2hGaWxlcyA9IFtdOyBzdGF0ZS5iYXRjaFJlc3VsdCA9IG51bGw7IHJlbmRlckJhdGNoKCk7IHJldHVybjsgfVxuICBpZiAodGFyZ2V0LmlkID09PSAnYmF0Y2gtY2hvb3NlLWRpcicpIHsgYmF0Y2hDaG9vc2VEaXIoKTsgcmV0dXJuOyB9XG4gIGlmICh0YXJnZXQuaWQgPT09ICdiYXRjaC1ydW4nKSB7IGJhdGNoUnVuKCk7IHJldHVybjsgfVxufSk7XG5cbi8vIFNoZWV0IHBhbmVsIGNsaWNrIGRlbGVnYXRpb25cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGVldC1jb250ZW50JykhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGU6IEV2ZW50KSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICBpZiAodGFyZ2V0LmNsYXNzTGlzdD8uY29udGFpbnMoJ3NoZWV0LW1vZGUtYnRuJykgJiYgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2dpZi1tb2RlLWJ0bicpKSB7XG4gICAgY29uc3QgbW9kZSA9IHRhcmdldC5kYXRhc2V0Lm1vZGUgYXMgJ2ZpeGVkJyB8ICdhdXRvJztcbiAgICBpZiAobW9kZSkgeyBzdGF0ZS5zaGVldE1vZGUgPSBtb2RlOyBzdGF0ZS5zaGVldFByZXZpZXcgPSBudWxsOyByZW5kZXJTaGVldCgpOyB9XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0YXJnZXQuY2xhc3NMaXN0Py5jb250YWlucygnZ2lmLW1vZGUtYnRuJykpIHtcbiAgICBjb25zdCBnaWZNb2RlID0gdGFyZ2V0LmRhdGFzZXQuZ2lmTW9kZSBhcyAncm93JyB8ICdhbGwnO1xuICAgIGlmIChnaWZNb2RlKSB7IHN0YXRlLmdpZk1vZGUgPSBnaWZNb2RlOyBzdGF0ZS5naWZQcmV2aWV3VXJsID0gbnVsbDsgcmVuZGVyU2hlZXQoKTsgfVxuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGFyZ2V0LmlkID09PSAnc2hlZXQtbm8tbm9ybWFsaXplJykgeyBzdGF0ZS5zaGVldENvbmZpZy5ub05vcm1hbGl6ZSA9ICFzdGF0ZS5zaGVldENvbmZpZy5ub05vcm1hbGl6ZTsgcmVuZGVyU2hlZXQoKTsgcmV0dXJuOyB9XG4gIGlmICh0YXJnZXQuaWQgPT09ICdzaGVldC1wcmV2aWV3LWJ0bicpIHsgc2hlZXRQcmV2aWV3QWN0aW9uKCk7IHJldHVybjsgfVxuICBpZiAodGFyZ2V0LmlkID09PSAnc2hlZXQtcHJvY2Vzcy1idG4nKSB7IHNoZWV0UHJvY2Vzc0FjdGlvbigpOyByZXR1cm47IH1cbiAgaWYgKHRhcmdldC5pZCA9PT0gJ3NoZWV0LXNhdmUtdGlsZXMtYnRuJykgeyBzaGVldFNhdmVUaWxlc0FjdGlvbigpOyByZXR1cm47IH1cbiAgaWYgKHRhcmdldC5pZCA9PT0gJ2dpZi1wcmV2aWV3LWJ0bicpIHsgZ2lmUHJldmlld0FjdGlvbigpOyByZXR1cm47IH1cbiAgaWYgKHRhcmdldC5pZCA9PT0gJ2dpZi1leHBvcnQtYnRuJykgeyBnaWZFeHBvcnRBY3Rpb24oKTsgcmV0dXJuOyB9XG59KTtcblxuaW5pdCgpO1xuIgogIF0sCiAgIm1hcHBpbmdzIjogIjtBQW1DQSxNQUFRLFdBQVcsT0FBTyxVQUFVO0FBQ3BDLE1BQVEsTUFBTSxZQUFZLE1BQU0sZUFBZSxPQUFPLFVBQVU7QUFnSmhFLElBQU0sUUFBa0I7QUFBQSxFQUN0QixXQUFXO0FBQUEsRUFDWCxhQUFhO0FBQUEsRUFDYixXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQUEsRUFDWCxvQkFBb0I7QUFBQSxFQUNwQixZQUFZO0FBQUEsRUFDWixVQUFVLENBQUM7QUFBQSxFQUNYLGNBQWM7QUFBQSxFQUNkLFFBQVE7QUFBQSxJQUNOLFVBQVU7QUFBQSxJQUNWLFlBQVk7QUFBQSxJQUNaLFlBQVk7QUFBQSxJQUNaLGtCQUFrQjtBQUFBLElBQ2xCLGNBQWM7QUFBQSxJQUNkLGVBQWU7QUFBQSxJQUNmLGFBQWE7QUFBQSxJQUNiLGFBQWE7QUFBQSxJQUNiLFlBQVk7QUFBQSxJQUNaLFlBQVk7QUFBQSxJQUNaLGVBQWU7QUFBQSxJQUNmLFlBQVk7QUFBQSxJQUNaLFVBQVU7QUFBQSxJQUNWLFNBQVM7QUFBQSxJQUNULGlCQUFpQjtBQUFBLElBQ2pCLGFBQWE7QUFBQSxJQUNiLFdBQVc7QUFBQSxJQUNYLGFBQWE7QUFBQSxJQUNiLGFBQWE7QUFBQSxJQUNiLGNBQWM7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsY0FBYztBQUFBLEVBQ2QsYUFBYTtBQUFBLEVBQ2IsZUFBZTtBQUFBLEVBQ2YsZUFBZTtBQUFBLEVBQ2YsYUFBYTtBQUFBLEVBQ2IsaUJBQWlCO0FBQUEsRUFFakIsWUFBWSxDQUFDO0FBQUEsRUFDYixnQkFBZ0I7QUFBQSxFQUNoQixjQUFjO0FBQUEs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QWUsRUFBRyxpQkFBaUIsU0FBUyxDQUFDLE1BQWE7QUFDaEYsUUFBTSxTQUFTLEVBQUU7QUFDakIsTUFBSSxPQUFPLE9BQU8sbUJBQW1CO0FBQUUsa0JBQWM7QUFBRztBQUFBLEVBQVE7QUFDaEUsTUFBSSxPQUFPLE9BQU8scUJBQXFCO0FBQUUsVUFBTSxhQUFhLENBQUM7QUFBRyxVQUFNLGNBQWM7QUFBTSxnQkFBWTtBQUFHO0FBQUEsRUFBUTtBQUNqSCxNQUFJLE9BQU8sT0FBTyxvQkFBb0I7QUFBRSxtQkFBZTtBQUFHO0FBQUEsRUFBUTtBQUNsRSxNQUFJLE9BQU8sT0FBTyxhQUFhO0FBQUUsYUFBUztBQUFHO0FBQUEsRUFBUTtBQUFBLENBQ3REO0FBR0QsU0FBUyxlQUFlLGVBQWUsRUFBRyxpQkFBaUIsU0FBUyxDQUFDLE1BQWE7QUFDaEYsUUFBTSxTQUFTLEVBQUU7QUFDakIsTUFBSSxPQUFPLFdBQVcsU0FBUyxnQkFBZ0IsTUFBTSxPQUFPLFVBQVUsU0FBUyxjQUFjLEdBQUc7QUFDOUYsVUFBTSxPQUFPLE9BQU8sUUFBUTtBQUM1QixRQUFJLE1BQU07QUFBRSxZQUFNLFlBQVk7QUFBTSxZQUFNLGVBQWU7QUFBTSxrQkFBWTtBQUFBLElBQUc7QUFDOUU7QUFBQSxFQUNGO0FBQ0EsTUFBSSxPQUFPLFdBQVcsU0FBUyxjQUFjLEdBQUc7QUFDOUMsVUFBTSxVQUFVLE9BQU8sUUFBUTtBQUMvQixRQUFJLFNBQVM7QUFBRSxZQUFNLFVBQVU7QUFBUyxZQUFNLGdCQUFnQjtBQUFNLGtCQUFZO0FBQUEsSUFBRztBQUNuRjtBQUFBLEVBQ0Y7QUFDQSxNQUFJLE9BQU8sT0FBTyxzQkFBc0I7QUFBRSxVQUFNLFlBQVksZUFBZSxNQUFNLFlBQVk7QUFBYSxnQkFBWTtBQUFHO0FBQUEsRUFBUTtBQUNqSSxNQUFJLE9BQU8sT0FBTyxxQkFBcUI7QUFBRSx1QkFBbUI7QUFBRztBQUFBLEVBQVE7QUFDdkUsTUFBSSxPQUFPLE9BQU8scUJBQXFCO0FBQUUsdUJBQW1CO0FBQUc7QUFBQSxFQUFRO0FBQ3ZFLE1BQUksT0FBTyxPQUFPLHdCQUF3QjtBQUFFLHlCQUFxQjtBQUFHO0FBQUEsRUFBUTtBQUM1RSxNQUFJLE9BQU8sT0FBTyxtQkFBbUI7QUFBRSxxQkFBaUI7QUFBRztBQUFBLEVBQVE7QUFDbkUsTUFBSSxPQUFPLE9BQU8sa0JBQWtCO0FBQUUsb0JBQWdCO0FBQUc7QUFBQSxFQUFRO0FBQUEsQ0FDbEU7QUFFRCxLQUFLOyIsCiAgImRlYnVnSWQiOiAiRDBGNTU3NjI1NzA4QjNCRjY0NzU2RTIxNjQ3NTZFMjEiLAogICJuYW1lcyI6IFtdCn0=
