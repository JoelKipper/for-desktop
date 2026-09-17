import { resolve } from "node:path";

import { app } from "electron";

import { mainWindow } from "./window";

/**
 * Custom URL scheme used to bring the user back into this app after a flow
 * that has to finish in the system browser - currently just Spotify OAuth
 * (see Account.tsx's connectSpotify and spotify-service.js's /callback).
 */
const PROTOCOL = "stoat";

/**
 * Register this app as the OS handler for stoat:// links. Must run before
 * "ready". The execPath/argv dance is Electron's documented way to make
 * this work when running unpackaged (`process.defaultApp` true) instead of
 * from an installed build.
 */
export function registerDeepLinkProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

/**
 * Pull a stoat:// URL out of a process argv list, if one was passed - how
 * Windows/Linux deliver the link (macOS uses the "open-url" event instead).
 */
export function findDeepLinkInArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

/**
 * Handle an incoming stoat:// link, however it arrived.
 */
export function handleDeepLink(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (url.protocol !== `${PROTOCOL}:`) return;

  mainWindow?.show();
  mainWindow?.focus();

  // host covers `stoat://spotify-connected`, pathname covers the
  // (equivalent, but sometimes how it parses) `stoat:/spotify-connected`
  if (url.hostname === "spotify-connected" || url.pathname === "/spotify-connected") {
    mainWindow?.webContents.send("spotifyConnected");
  }
}
