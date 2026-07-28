const { app, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { isNativeWayland } = require('./desktopEnvironment');

const WINDOW_STATE_FILE = 'desktop-window-state.json';
const DEFAULT_WINDOW_PRESET = 'balanced';
const CUSTOM_WINDOW_PRESET = 'custom';
const WINDOW_PRESETS = {
  compact: { width: 1040, height: 700 },
  balanced: { width: 1280, height: 900 },
  cinematic: { width: 1560, height: 980 },
};
const MIN_WINDOW_BOUNDS = { width: 900, height: 600 };

function getStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function readWindowState() {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const preset = getValidPreset(parsed?.preset) ?? CUSTOM_WINDOW_PRESET;
    const bounds = normalizeBounds(parsed?.bounds);
    return {
      preset,
      bounds,
      customBounds:
        normalizeBounds(parsed?.customBounds) ??
        (preset === CUSTOM_WINDOW_PRESET ? bounds : null),
    };
  } catch {
    return {
      preset: DEFAULT_WINDOW_PRESET,
      bounds: null,
      customBounds: null,
    };
  }
}

function writeWindowState(state) {
  try {
    fs.writeFileSync(
      getStatePath(),
      JSON.stringify(
        {
          preset: getValidPreset(state?.preset) ?? DEFAULT_WINDOW_PRESET,
          bounds: normalizeBounds(state?.bounds),
          customBounds: normalizeBounds(state?.customBounds),
        },
        null,
        2
      )
    );
  } catch (error) {
    console.warn('Failed to save window state:', error);
  }
}

function getValidPreset(value) {
  if (value === CUSTOM_WINDOW_PRESET) {
    return CUSTOM_WINDOW_PRESET;
  }

  return Object.prototype.hasOwnProperty.call(WINDOW_PRESETS, value) ? value : null;
}

function isPresetBounds(bounds, presetId) {
  const preset = WINDOW_PRESETS[presetId];
  const normalized = normalizeBounds(bounds);

  if (!preset || !normalized) {
    return false;
  }

  return normalized.width === preset.width && normalized.height === preset.height;
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  if (![x, y, width, height].every(Number.isFinite)) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(MIN_WINDOW_BOUNDS.width, Math.round(width)),
    height: Math.max(MIN_WINDOW_BOUNDS.height, Math.round(height)),
  };
}

function getVisibleBounds(bounds) {
  const normalized = normalizeBounds(bounds);

  if (!normalized) {
    return null;
  }

  const display = screen.getDisplayMatching(normalized);
  const workArea = display.workArea;
  const width = Math.min(normalized.width, workArea.width);
  const height = Math.min(normalized.height, workArea.height);

  return {
    x: Math.min(Math.max(normalized.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(normalized.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height,
  };
}

function getPersistableBounds(bounds, previousBounds = null) {
  const normalized = normalizeBounds(bounds);

  if (!normalized || !isNativeWayland()) {
    return normalized;
  }

  const previous = normalizeBounds(previousBounds);

  return {
    ...normalized,
    x: previous?.x ?? 0,
    y: previous?.y ?? 0,
  };
}

function getInitialWindowOptions() {
  const state = readWindowState();
  const preset = WINDOW_PRESETS[state.preset] ?? WINDOW_PRESETS[DEFAULT_WINDOW_PRESET];

  if (isNativeWayland()) {
    const savedSize = normalizeBounds(state.bounds);

    return {
      width: savedSize?.width ?? preset.width,
      height: savedSize?.height ?? preset.height,
    };
  }

  const bounds = getVisibleBounds(state.bounds);

  return {
    width: bounds?.width ?? preset.width,
    height: bounds?.height ?? preset.height,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
  };
}

function getPresetBounds(win, presetId) {
  const preset = WINDOW_PRESETS[presetId] ?? WINDOW_PRESETS[DEFAULT_WINDOW_PRESET];
  const currentBounds = win?.getBounds?.() ?? {};
  const display = screen.getDisplayMatching({
    x: currentBounds.x ?? 0,
    y: currentBounds.y ?? 0,
    width: currentBounds.width ?? preset.width,
    height: currentBounds.height ?? preset.height,
  });
  const workArea = display.workArea;
  const width = Math.min(preset.width, workArea.width);
  const height = Math.min(preset.height, workArea.height);
  const searchAnchorX = (currentBounds.x ?? workArea.x) + (currentBounds.width ?? width) / 2;
  const anchoredX = Math.round(searchAnchorX - width / 2);
  const anchoredY = Math.round(currentBounds.y ?? workArea.y);

  return {
    x: Math.min(Math.max(anchoredX, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(anchoredY, workArea.y), workArea.y + workArea.height - height),
    width,
    height,
  };
}

function saveWindowBounds(win, preset = readWindowState().preset) {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) {
    return null;
  }

  const saved = readWindowState();
  const bounds = getPersistableBounds(win.getBounds(), saved.bounds);
  const nextPreset = isPresetBounds(bounds, preset) ? preset : CUSTOM_WINDOW_PRESET;

  const nextState = {
    preset: nextPreset,
    bounds,
    customBounds: nextPreset === CUSTOM_WINDOW_PRESET ? bounds : saved.customBounds,
  };

  writeWindowState(nextState);

  return nextState;
}

function getLiveWindowState(win) {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) {
    return null;
  }

  const saved = readWindowState();
  const bounds = getPersistableBounds(win.getBounds(), saved.bounds);
  const preset = isPresetBounds(bounds, saved.preset) ? saved.preset : CUSTOM_WINDOW_PRESET;

  return {
    preset,
    bounds,
    customBounds: saved.customBounds,
  };
}

function emitWindowStateChanged(win, state) {
  if (!state || !win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return;
  }

  win.webContents.send('window-state:changed', {
    ok: true,
    preset: state.preset,
    bounds: state.bounds,
    customBounds: state.customBounds,
  });
}

function attachWindowState(win) {
  let saveTimer = null;

  function scheduleSave() {
    emitWindowStateChanged(win, getLiveWindowState(win));

    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      emitWindowStateChanged(win, saveWindowBounds(win));
    }, 350);
  }

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    emitWindowStateChanged(win, saveWindowBounds(win));
  });
}

function getWindowState(win) {
  const saved = readWindowState();
  const bounds =
    win && !win.isDestroyed()
      ? getPersistableBounds(win.getBounds(), saved.bounds)
      : saved.bounds;

  return {
    ok: true,
    preset: saved.preset,
    bounds,
    customBounds: saved.customBounds,
    capabilities: {
      exactPositioning: !isNativeWayland(),
      liveResize: isNativeWayland() ? 'verify' : 'supported',
    },
    presets: Object.entries(WINDOW_PRESETS).map(([id, value]) => ({
      id,
      width: value.width,
      height: value.height,
    })),
  };
}

function sizeMatches(bounds, target) {
  return (
    Math.abs(bounds.width - target.width) <= 2 &&
    Math.abs(bounds.height - target.height) <= 2
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyWaylandSize(win, target) {
  win.setSize(target.width, target.height, false);

  let actual = win.getBounds();

  if (!sizeMatches(actual, target)) {
    await wait(200);
    actual = win.getBounds();
  }

  return actual;
}

async function applyWindowPreset(win, presetId) {
  const preset = getValidPreset(presetId);

  if (!win || win.isDestroyed() || !preset) {
    return {
      ok: false,
      message: 'Window preset is unavailable.',
    };
  }

  const saved = readWindowState();

  if (isNativeWayland()) {
    const actualBounds = await applyWaylandSize(win, WINDOW_PRESETS[preset]);
    const bounds = getPersistableBounds(actualBounds, saved.bounds);

    if (!sizeMatches(bounds, WINDOW_PRESETS[preset])) {
      return {
        ok: false,
        preset: saved.preset,
        bounds,
        customBounds: saved.customBounds,
        message:
          'Your Wayland compositor kept control of the live window size. Manual resizing is still available.',
      };
    }

    const nextState = { preset, bounds, customBounds: saved.customBounds };
    writeWindowState(nextState);
    emitWindowStateChanged(win, nextState);

    return {
      ok: true,
      preset,
      bounds,
      customBounds: saved.customBounds,
      message: `Window preset set to ${preset}. Live resize was accepted by your Wayland compositor.`,
    };
  }

  const bounds = getPresetBounds(win, preset);
  win.setBounds(bounds, false);
  const nextState = { preset, bounds, customBounds: saved.customBounds };
  writeWindowState(nextState);
  emitWindowStateChanged(win, nextState);

  return {
    ok: true,
    preset,
    bounds,
    customBounds: saved.customBounds,
    message: `Window preset set to ${preset}.`,
  };
}

async function applyCustomWindowBounds(win, payload = {}) {
  if (!win || win.isDestroyed()) {
    return {
      ok: false,
      message: 'Window layout is unavailable.',
    };
  }

  const currentBounds = win.getBounds();

  if (isNativeWayland()) {
    const saved = readWindowState();
    const target = {
      width: Math.max(
        MIN_WINDOW_BOUNDS.width,
        Math.round(Number(payload.width) || currentBounds.width)
      ),
      height: Math.max(
        MIN_WINDOW_BOUNDS.height,
        Math.round(Number(payload.height) || currentBounds.height)
      ),
    };
    const actualBounds = await applyWaylandSize(win, target);
    const bounds = getPersistableBounds(actualBounds, saved.bounds);

    if (!sizeMatches(bounds, target)) {
      return {
        ok: false,
        preset: saved.preset,
        bounds,
        customBounds: saved.customBounds,
        minimum: MIN_WINDOW_BOUNDS,
        message:
          'Your Wayland compositor kept control of the live window size. You can resize Seenary manually.',
      };
    }

    const nextState = {
      preset: CUSTOM_WINDOW_PRESET,
      bounds,
      customBounds: bounds,
    };
    writeWindowState(nextState);
    emitWindowStateChanged(win, nextState);

    return {
      ok: true,
      preset: CUSTOM_WINDOW_PRESET,
      bounds,
      customBounds: bounds,
      minimum: MIN_WINDOW_BOUNDS,
      message: 'Custom window size applied through your Wayland compositor.',
    };
  }

  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const width = Math.min(
    workArea.width,
    Math.max(MIN_WINDOW_BOUNDS.width, Math.round(Number(payload.width) || currentBounds.width))
  );
  const height = Math.min(
    workArea.height,
    Math.max(MIN_WINDOW_BOUNDS.height, Math.round(Number(payload.height) || currentBounds.height))
  );
  const searchAnchorX = currentBounds.x + currentBounds.width / 2;
  const bounds = {
    x: Math.min(Math.max(Math.round(searchAnchorX - width / 2), workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(currentBounds.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height,
  };

  win.setBounds(bounds, false);
  const nextState = {
    preset: CUSTOM_WINDOW_PRESET,
    bounds,
    customBounds: bounds,
  };
  writeWindowState(nextState);
  emitWindowStateChanged(win, nextState);

  return {
    ok: true,
    preset: CUSTOM_WINDOW_PRESET,
    bounds,
    customBounds: bounds,
    minimum: MIN_WINDOW_BOUNDS,
  };
}

function registerWindowStateIpc(getWindow) {
  if (ipcMain.listenerCount('window-state:get') === 0) {
    ipcMain.handle('window-state:get', () => getWindowState(getWindow()));
  }

  if (ipcMain.listenerCount('window-state:set-preset') === 0) {
    ipcMain.handle('window-state:set-preset', (_event, presetId) =>
      applyWindowPreset(getWindow(), presetId)
    );
  }

  if (ipcMain.listenerCount('window-state:set-custom-bounds') === 0) {
    ipcMain.handle('window-state:set-custom-bounds', (_event, payload) =>
      applyCustomWindowBounds(getWindow(), payload)
    );
  }
}

module.exports = {
  attachWindowState,
  getInitialWindowOptions,
  registerWindowStateIpc,
};
