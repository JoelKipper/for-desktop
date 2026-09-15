import { ipcMain } from "electron";

/**
 * How often to poll for the focused window in the background, so we can
 * remember the last non-Stoat app even while Stoat itself is focused
 * (which is the common case while actively chatting).
 */
const POLL_INTERVAL_MS = 3_000;

/**
 * The last foreground app we saw that wasn't Stoat itself.
 */
let lastNonStoatApp: string | undefined;

/**
 * Strip a platform-specific executable suffix (e.g. `Code.exe` -> `Code`)
 * so the reported app name looks the same across operating systems.
 */
function cleanAppName(name: string) {
  return name.replace(/\.(exe|app)$/i, "");
}

async function pollActiveWindow() {
  try {
    // `get-windows` is ESM-only, loaded dynamically so this still works
    // from this CommonJS main-process module.
    const { activeWindow } = await import("get-windows");
    const result = await activeWindow();
    const name = result?.owner?.name;

    // Ignore ourselves — we want to keep showing whatever the user was
    // doing before they switched to Stoat to chat, not "Stoat" itself.
    if (name && !name.toLowerCase().includes("stoat")) {
      lastNonStoatApp = cleanAppName(name);
    }
  } catch {
    // get-windows may be unavailable on some platforms/sandboxes (e.g.
    // missing permissions on macOS, or a Linux session without support).
    // Leave lastNonStoatApp as-is rather than clearing a valid value.
  }
}

setInterval(pollActiveWindow, POLL_INTERVAL_MS);
pollActiveWindow();

ipcMain.handle("getActiveWindow", () => lastNonStoatApp);
