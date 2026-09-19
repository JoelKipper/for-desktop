import { updateElectronApp } from "update-electron-app";

import { Notification, app, autoUpdater, ipcMain } from "electron";

import { mainWindow } from "./window";

// Releases are published to this fork (see forge.config.ts), not to the
// upstream repo that package.json's "repository" field points at.
const UPDATE_REPO = "JoelKipper/for-desktop";

export type UpdateStatus = {
  state:
    | "unsupported"
    | "idle"
    | "checking"
    | "downloading"
    | "ready"
    | "upToDate"
    | "error";
  version?: string;
  error?: string;
};

// Electron's autoUpdater only works in packaged builds on Windows/macOS.
const supported =
  app.isPackaged &&
  (process.platform === "win32" || process.platform === "darwin");

let status: UpdateStatus = { state: supported ? "idle" : "unsupported" };

function setStatus(next: UpdateStatus) {
  status = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updaterStatus", status);
  }
}

/**
 * Start background update checks and expose manual check / install to the
 * web client. Squirrel downloads an update on its own once it finds one and
 * reports no progress, so "downloading" is indeterminate.
 */
export function initUpdater() {
  ipcMain.handle("updaterGetStatus", () => status);

  ipcMain.handle("updaterCheck", () => {
    if (
      !supported ||
      status.state === "checking" ||
      status.state === "downloading" ||
      status.state === "ready"
    ) {
      return status;
    }

    setStatus({ state: "checking" });
    try {
      autoUpdater.checkForUpdates();
    } catch (err) {
      setStatus({ state: "error", error: String(err) });
    }
    return status;
  });

  ipcMain.on("updaterInstall", () => {
    if (status.state === "ready") autoUpdater.quitAndInstall();
  });

  if (!supported) return;

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-available", () => setStatus({ state: "downloading" }));
  autoUpdater.on("update-not-available", () =>
    setStatus({ state: "upToDate" }),
  );
  autoUpdater.on("error", (err) =>
    setStatus({ state: "error", error: err.message }),
  );
  autoUpdater.on("update-downloaded", (_event, _notes, releaseName) => {
    setStatus({ state: "ready", version: releaseName });

    new Notification({
      title: "Update Available",
      body: "Restart the app to install the update.",
      silent: true,
    }).show();
  });

  updateElectronApp({ repo: UPDATE_REPO, notifyUser: false });
}
