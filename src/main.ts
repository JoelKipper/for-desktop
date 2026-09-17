import { IUpdateInfo, updateElectronApp } from "update-electron-app";

import { BrowserWindow, Notification, app, shell } from "electron";
import started from "electron-squirrel-startup";

import "./native/activityStatus";
import { initAutoLaunch } from "./native/autoLaunch";
import { config } from "./native/config";
import {
  findDeepLinkInArgv,
  handleDeepLink,
  registerDeepLinkProtocol,
} from "./native/deepLink";
import { initDiscordRpc } from "./native/discordRpc";
import { initTray } from "./native/tray";
import { initVirtualMic } from "./native/virtualMic";
import { BUILD_URL, createMainWindow, mainWindow } from "./native/window";

// must run before "ready" (see registerDeepLinkProtocol's own comment)
registerDeepLinkProtocol();

// Squirrel-specific logic
// create/remove shortcuts on Windows when installing / uninstalling
// we just need to close out of the app immediately
if (started) {
  app.quit();
}

// disable hw-accel if so requested
if (!config.hardwareAcceleration) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
}

// ensure only one copy of the application can run
const acquiredLock = app.requestSingleInstanceLock();

const onNotifyUser = (_info: IUpdateInfo) => {
  const notification = new Notification({
    title: "Update Available",
    body: "Restart the app to install the update.",
    silent: true,
  });

  notification.show();
};

if (acquiredLock) {
  // start auto update logic
  updateElectronApp({ onNotifyUser });

  // create and configure the app when electron is ready
  app.on("ready", () => {
    // create window and application contexts
    createMainWindow();

    // save first launch state
    if (config.firstLaunch) {
      // Doesn't do anything right now. Used to enable auto start, but that behaviour was removed.
      // Left in case it gets used in the future.
      config.firstLaunch = false;
    }

    initTray();
    initDiscordRpc();
    initVirtualMic();
    initAutoLaunch();

    // Windows specific fix for notifications
    if (process.platform === "win32") {
      app.setAppUserModelId("chat.stoat.notifications");
    }

    // Windows/Linux: a stoat:// link launching the app for the first time
    // arrives as a regular argv, not "open-url" (that's macOS only).
    const initialDeepLink = findDeepLinkInArgv(process.argv);
    if (initialDeepLink) handleDeepLink(initialDeepLink);
  });

  // focus the window if we try to launch again
  app.on("second-instance", (_event, argv) => {
    mainWindow.show();
    mainWindow.restore();
    mainWindow.focus();

    // Windows/Linux: re-launching via a stoat:// link while already
    // running surfaces here instead of "open-url".
    const deepLink = findDeepLinkInArgv(argv);
    if (deepLink) handleDeepLink(deepLink);
  });

  // macOS: a stoat:// link, whether the app was already running or this
  // launched it.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // macOS specific behaviour to keep app active in dock:
  // (irrespective of the minimise-to-tray option)

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ensure URLs launch in external context
  app.on("web-contents-created", (_, contents) => {
    // prevent navigation out of build URL origin, but hand it to the
    // system browser instead of just dropping it - needed for flows like
    // Spotify OAuth (Account.tsx does a same-window redirect through
    // accounts.spotify.com) which otherwise silently go nowhere in-app.
    contents.on("will-navigate", (event, navigationUrl) => {
      if (new URL(navigationUrl).origin !== BUILD_URL.origin) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    });

    // handle links externally
    contents.setWindowOpenHandler(({ url }) => {
      if (
        url.startsWith("http:") ||
        url.startsWith("https:") ||
        url.startsWith("mailto:")
      ) {
        setImmediate(() => {
          shell.openExternal(url);
        });
      }

      return { action: "deny" };
    });
  });
} else {
  app.quit();
}
