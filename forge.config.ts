import { MakerFlatpak } from "@electron-forge/maker-flatpak";
import { MakerFlatpakOptionsConfig } from "@electron-forge/maker-flatpak/dist/Config";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import fs from "node:fs";
import path from "node:path";

// import { globSync } from "node:fs";

const STRINGS = {
  author: "Revolt Platforms LTD",
  name: "Stoat",
  execName: "stoat-desktop",
  description: "Open source user-first chat platform.",
};

const ASSET_DIR = "assets/desktop";

/**
 * Build targets for the desktop app
 */
const makers: ForgeConfig["makers"] = [
  new MakerSquirrel({
    name: STRINGS.name,
    authors: STRINGS.author,
    // todo: hoist this
    iconUrl: `https://stoat.chat/app/assets/icon-DUSNE-Pb.ico`,
    // todo: loadingGif
    setupIcon: `${ASSET_DIR}/icon.ico`,
    description: STRINGS.description,
    exe: `${STRINGS.execName}.exe`,
    setupExe: `${STRINGS.execName}-setup.exe`,
    copyright: "Copyright (C) 2025 Revolt Platforms LTD",
  }),
  // Restricted to darwin/linux: on win32, cross-zip's cleanup step calls
  // fs.rmdir(path, { recursive: true }), which newer Node releases reject
  // (ERR_INVALID_ARG_VALUE). Windows users get the Squirrel installer instead.
  new MakerZIP({}, ["darwin", "linux"]),
  new MakerFlatpak({
    options: {
      id: "chat.stoat.StoatDesktop",
      description: STRINGS.description,
      productName: STRINGS.name,
      productDescription: STRINGS.description,
      runtimeVersion: "25.08",
      icon: {
        "16x16": `${ASSET_DIR}/hicolor/16x16.png`,
        "32x32": `${ASSET_DIR}/hicolor/32x32.png`,
        "64x64": `${ASSET_DIR}/hicolor/64x64.png`,
        "128x128": `${ASSET_DIR}/hicolor/128x128.png`,
        "256x256": `${ASSET_DIR}/hicolor/256x256.png`,
        "512x512": `${ASSET_DIR}/hicolor/512x512.png`,
      } as unknown,
      categories: ["Network"],
      modules: [
        // use the latest zypak -- Electron sandboxing for Flatpak
        {
          name: "zypak",
          sources: [
            {
              type: "git",
              url: "https://github.com/refi64/zypak",
              tag: "v2025.09",
            },
          ],
        },
      ],
      finishArgs: [
        // default arguments found by running
        // DEBUG=electron-installer-flatpak* pnpm make
        "--socket=fallback-x11",
        "--socket=wayland",
        "--share=ipc",
        "--share=network",
        "--device=dri",
        "--device=all",
        "--socket=pulseaudio",
        "--filesystem=xdg-run/pipewire-0",
        "--filesystem=xdg-videos:ro",
        "--filesystem=xdg-pictures:ro",
        "--filesystem=xdg-download",
        "--filesystem=xdg-run/speech-dispatcher",
        "--talk-name=org.freedesktop.ScreenSaver",
        "--talk-name=org.freedesktop.Notifications",
        "--talk-name=org.kde.StatusNotifierWatcher",
        "--talk-name=com.canonical.AppMenu.Registrar",
        "--talk-name=com.canonical.indicator.application",
        "--talk-name=com.canonical.Unity",
        "--env=XCURSOR_PATH=/run/host/user-share/icons:/run/host/share/icons",
      ],
      files: [],
    } as MakerFlatpakOptionsConfig,
  }),
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: STRINGS.name,
    executableName: STRINGS.execName,
    // Registers stoat:// as a URL scheme handled by this app (currently
    // used to return from Spotify OAuth run in the system browser - see
    // native/deepLink.ts). Mainly matters on macOS, where this writes
    // CFBundleURLTypes into Info.plist at package time; Windows/Linux
    // register it at runtime instead via app.setAsDefaultProtocolClient.
    protocols: [{ name: STRINGS.name, schemes: ["stoat"] }],
    icon:
      process.platform === "darwin"
        ? `${ASSET_DIR}/icon.icon`
        : `${ASSET_DIR}/icon`,
    // extraResource: [
    //   // include all the asset files
    //   ...globSync(ASSET_DIR + "/**/*"),
    // ],
  },
  // Skip electron-rebuild entirely: the only native modules in this
  // project (get-windows, node-pipewire) already ship prebuilt binaries
  // for their target platforms and are wired in manually via the
  // packageAfterCopy hook below. Rebuilding from source needs a full
  // node-gyp/Visual-Studio-C++ toolchain, which isn't set up on the
  // GitHub Actions Windows runner and isn't needed here anyway.
  rebuildConfig: { onlyModules: [] },
  makers,
  hooks: {
    // Copy the node-pipewire dist to the app on linux
    packageAfterCopy: async (_config, buildPath, _version, platform) => {
      if (platform === "linux") {
        // Copy only the files we need to run the code, which is dist, LICENSE, and package.json
        fs.cpSync(
          "node_modules/node-pipewire/dist",
          path.join(buildPath, "node_modules/node-pipewire/dist"),
          { recursive: true },
        );
        fs.cpSync(
          "node_modules/node-pipewire/LICENSE",
          path.join(buildPath, "node_modules/node-pipewire/LICENSE"),
          { recursive: true },
        );
        fs.cpSync(
          "node_modules/node-pipewire/package.json",
          path.join(buildPath, "node_modules/node-pipewire/package.json"),
          { recursive: true },
        );
      }

      // `get-windows` is marked `external` in vite.main.config.ts (it's a
      // native N-API addon, which Vite can't bundle), so Vite's output
      // just does `import("get-windows")` at runtime expecting to resolve
      // it from node_modules like a normal package. But Vite-based
      // electron-forge apps don't copy node_modules into the packaged app
      // at all (everything is expected to be inlined into the bundle),
      // so without this, the package is simply missing at runtime on
      // every platform. Copy the whole thing (incl. its own
      // node_modules/node-addon-api, which its native loader needs) minus
      // build scaffolding we don't need at runtime.
      if (platform === "win32" || platform === "darwin") {
        fs.cpSync(
          "node_modules/get-windows",
          path.join(buildPath, "node_modules/get-windows"),
          {
            recursive: true,
            filter: (src) =>
              !/[\\/]node_modules[\\/]get-windows[\\/](build|Sources|binding\.gyp)([\\/]|$)/.test(
                src,
              ),
          },
        );
      }

      // On Windows, get-windows resolves its native binding through
      // `@mapbox/node-pre-gyp`, which would drag in ~9 more runtime
      // dependencies (nopt, npmlog, tar, node-fetch, ...) just to be
      // copied too. macOS/Linux don't need it at all (they shell out to a
      // bundled Swift binary / xprop respectively), so patch it out of
      // the packaged copy on Windows instead: look the prebuilt .node up
      // directly by platform/arch, skipping node-pre-gyp entirely.
      if (platform === "win32") {
        const windowsJsPath = path.join(
          buildPath,
          "node_modules/get-windows/lib/windows.js",
        );
        fs.writeFileSync(
          windowsJsPath,
          `import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getAddon = () => {
	const require = createRequire(import.meta.url);
	const bindingRoot = path.join(__dirname, 'binding');
	let bindingPath;
	try {
		const match = fs
			.readdirSync(bindingRoot)
			.find((name) => name.includes('-win32-') && name.endsWith('-' + process.arch));
		if (match) {
			bindingPath = path.join(bindingRoot, match, 'node-get-windows.node');
		}
	} catch {}

	return (bindingPath && fs.existsSync(bindingPath)) ? require(bindingPath) : {
		getActiveWindow() {},
		getOpenWindows() {},
	};
};

export async function activeWindow() {
	return getAddon().getActiveWindow();
}

export function activeWindowSync() {
	return getAddon().getActiveWindow();
}

export function openWindows() {
	return getAddon().getOpenWindows();
}

export function openWindowsSync() {
	return getAddon().getOpenWindows();
}
`,
        );
      }
    },
  },
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        // Defaults to stoatchat/for-desktop for local builds; in CI this
        // resolves to whichever repo (fork or upstream) the run is in, so
        // forks publish their own releases without editing this file.
        owner: process.env.GITHUB_REPOSITORY_OWNER ?? "stoatchat",
        name: process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "for-desktop",
      },
      // Without this, publishing again for a version that already has a
      // release (the common case here, since this fork doesn't bump the
      // version on every push) silently skips re-uploading assets that
      // already exist by that name, so the "release" never actually
      // updates.
      overwrite: true,
      // electron-forge defaults to creating draft releases, which stay
      // invisible (not "Latest", not in the unauthenticated API, and
      // useless for the auto-updater) until someone manually publishes
      // them on GitHub. Publish immediately instead.
      draft: false,
    }),
  ],
};

export default config;
