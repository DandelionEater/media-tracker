const { app, ipcMain } = require('electron');

const GLOBAL_SHORTCUTS_PORTAL_FEATURE = 'GlobalShortcutsPortal';

function normalizeEnvironmentValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getDisplayBackend() {
  if (process.platform !== 'linux') {
    return 'other';
  }

  const ozonePlatform = normalizeEnvironmentValue(
    app.commandLine.getSwitchValue('ozone-platform')
  ).toLowerCase();

  if (ozonePlatform === 'wayland' || ozonePlatform === 'x11') {
    return ozonePlatform;
  }

  const sessionType = normalizeEnvironmentValue(process.env.XDG_SESSION_TYPE).toLowerCase();

  if (sessionType === 'wayland' || sessionType === 'x11') {
    return sessionType;
  }

  return 'unknown';
}

function getDesktopEnvironment() {
  if (process.platform !== 'linux') {
    return null;
  }

  const currentDesktop = normalizeEnvironmentValue(process.env.XDG_CURRENT_DESKTOP);
  const desktopSession = normalizeEnvironmentValue(process.env.DESKTOP_SESSION);
  const combined = `${currentDesktop}:${desktopSession}`.toLowerCase();

  if (process.env.HYPRLAND_INSTANCE_SIGNATURE || combined.includes('hyprland')) {
    return 'Hyprland';
  }

  if (combined.includes('kde') || combined.includes('plasma')) {
    return 'KDE Plasma';
  }

  if (combined.includes('gnome')) {
    return 'GNOME';
  }

  if (combined.includes('sway')) {
    return 'Sway';
  }

  if (combined.includes('niri')) {
    return 'Niri';
  }

  return currentDesktop || desktopSession || 'Unknown';
}

function isNativeWayland() {
  return process.platform === 'linux' && getDisplayBackend() === 'wayland';
}

function enableWaylandGlobalShortcutsPortal() {
  if (!isNativeWayland()) {
    return false;
  }

  const enabledFeatures = app.commandLine
    .getSwitchValue('enable-features')
    .split(',')
    .map((feature) => feature.trim())
    .filter(Boolean);

  if (!enabledFeatures.includes(GLOBAL_SHORTCUTS_PORTAL_FEATURE)) {
    enabledFeatures.push(GLOBAL_SHORTCUTS_PORTAL_FEATURE);
    app.commandLine.appendSwitch('enable-features', enabledFeatures.join(','));
  }

  return true;
}

function getDesktopEnvironmentInfo() {
  const displayBackend = getDisplayBackend();
  const nativeWayland = displayBackend === 'wayland';

  return {
    ok: true,
    platform: process.platform,
    displayBackend,
    desktopEnvironment: getDesktopEnvironment(),
    sessionType: normalizeEnvironmentValue(process.env.XDG_SESSION_TYPE) || null,
    ozonePlatform:
      normalizeEnvironmentValue(app.commandLine.getSwitchValue('ozone-platform')) || 'auto',
    capabilities: {
      exactWindowPositioning: !nativeWayland,
      liveWindowResize: nativeWayland ? 'verify' : 'supported',
      globalShortcuts: nativeWayland ? 'portal' : 'native',
      launchAtLogin: process.platform !== 'linux',
    },
  };
}

function registerDesktopEnvironmentIpc() {
  if (ipcMain.listenerCount('desktop-environment:get') === 0) {
    ipcMain.handle('desktop-environment:get', () => getDesktopEnvironmentInfo());
  }
}

module.exports = {
  enableWaylandGlobalShortcutsPortal,
  getDesktopEnvironmentInfo,
  getDisplayBackend,
  isNativeWayland,
  registerDesktopEnvironmentIpc,
};
