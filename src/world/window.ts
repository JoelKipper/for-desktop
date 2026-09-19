import { contextBridge, ipcRenderer } from "electron";

import { version } from "../../package.json";

contextBridge.exposeInMainWorld("native", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    desktop: () => version,
  },

  minimise: () => ipcRenderer.send("minimise"),
  maximise: () => ipcRenderer.send("maximise"),
  close: () => ipcRenderer.send("close"),

  setBadgeCount: (count: number) => ipcRenderer.send("setBadgeCount", count),

  onceScreenPicker: (
    onScreenPick: (
      sources: {
        idx: number;
        name: string;
        isFullScreen: boolean;
        image?: string;
      }[],
    ) => void,
  ) => {
    const eventName = "screenPicker";
    ipcRenderer.removeAllListeners(eventName);
    ipcRenderer.once(eventName, (_, sources) => onScreenPick(sources));
  },
  screenPickerCallback: (
    idx: number,
    audio: boolean,
    trackActiveWindow?: boolean,
  ) => ipcRenderer.send("screenPickerCallback", idx, audio, trackActiveWindow),

  isWayland: () => ipcRenderer.invoke("getIsWayland"),

  getActiveWindow: () => ipcRenderer.invoke("getActiveWindow"),

  onActiveWindowTrackSwitch: (callback: (sourceId: string) => void) => {
    const eventName = "activeWindowTrackSwitch";
    const listener = (_: unknown, sourceId: string) => callback(sourceId);
    ipcRenderer.on(eventName, listener);
    return () => {
      ipcRenderer.removeListener(eventName, listener);
      ipcRenderer.send("stopTrackingActiveWindow");
    };
  },

  updater: {
    getStatus: () => ipcRenderer.invoke("updaterGetStatus"),
    check: () => ipcRenderer.invoke("updaterCheck"),
    install: () => ipcRenderer.send("updaterInstall"),
    onStatus: (callback: (status: unknown) => void) => {
      const eventName = "updaterStatus";
      const listener = (_: unknown, status: unknown) => callback(status);
      ipcRenderer.on(eventName, listener);
      return () => ipcRenderer.removeListener(eventName, listener);
    },
  },

  onSpotifyConnected: (callback: () => void) => {
    const eventName = "spotifyConnected";
    const listener = () => callback();
    ipcRenderer.on(eventName, listener);
    return () => ipcRenderer.removeListener(eventName, listener);
  },
});
