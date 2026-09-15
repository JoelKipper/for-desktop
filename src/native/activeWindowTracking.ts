import { desktopCapturer } from "electron";

/**
 * How often to check whether the focused window has changed while a
 * "track active window" screen share is running.
 */
const POLL_INTERVAL_MS = 2_000;

let stopCurrent: (() => void) | undefined;

/**
 * Start following the focused window for an in-progress screen share.
 * Calls `onSourceChange` with a new `desktopCapturer` source id every time
 * the focused window changes to a different (non-Stoat) window.
 *
 * Only one tracking session can run at a time — starting a new one stops
 * any previous one.
 *
 * @returns A function to stop tracking.
 */
export function startTrackingActiveWindowForCapture(
  onSourceChange: (sourceId: string) => void,
): () => void {
  stopTrackingActiveWindowForCapture();

  let lastTitle: string | undefined;
  let stopped = false;

  async function poll() {
    if (stopped) return;

    try {
      const { activeWindow } = await import("get-windows");
      const result = await activeWindow();
      const title = result?.title;
      const ownerName = result?.owner?.name?.toLowerCase() ?? "";

      // Don't try to capture ourselves.
      if (!title || title === lastTitle || ownerName.includes("stoat")) {
        return;
      }

      // `desktopCapturer` window sources are named after the window
      // title, which is what we match the focused window against.
      const sources = await desktopCapturer.getSources({ types: ["window"] });
      const match = sources.find(
        (source) => source.name === title || source.name.includes(title),
      );

      if (match) {
        lastTitle = title;
        onSourceChange(match.id);
      }
    } catch {
      // get-windows may be unavailable on some platforms/sandboxes (e.g.
      // missing permissions on macOS, or a Linux session without
      // support) — just skip this tick.
    }
  }

  const interval = setInterval(poll, POLL_INTERVAL_MS);
  poll();

  stopCurrent = () => {
    stopped = true;
    clearInterval(interval);
    stopCurrent = undefined;
  };

  return stopCurrent;
}

/**
 * Stop any in-progress "track active window" session.
 */
export function stopTrackingActiveWindowForCapture() {
  stopCurrent?.();
}
