const config = Object.freeze({
  storageKey: "selloutshield:blockedChannels",
  overlayId: "selloutshield-overlay",
  injectedScriptFile: "injected.js",
  injectedScriptTagId: "selloutshield-injected-v2",
  cacheKey: "selloutshield:blocktubeCache:v1",
  postMessage: Object.freeze({
    fromContent: "SELLOUTSHIELD_CONTENT",
    fromPage: "SELLOUTSHIELD_PAGE",
    types: Object.freeze({ storageData: "storageData", ready: "ready", playerBlocked: "playerBlocked" })
  }),
  overlayTimersMs: Object.freeze({ forced: 10 * 60 * 1000, pending: 2000 })
});

const asArray = (value) => (Array.isArray(value) ? value : []);

const safeCall = (fn, fallback = undefined) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const escapeRegExp = (value) => String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toChannel = (value) => {
  if (!value || typeof value !== "object") return { id: "", name: "", owner: "" };
  return {
    id: typeof value.id === "string" ? value.id.trim() : "",
    name: typeof value.name === "string" ? value.name.trim() : "",
    owner: typeof value.owner === "string" ? value.owner.trim() : ""
  };
};

const buildBlockIndex = (channels) => {
  const list = asArray(channels).map(toChannel);
  const ids = new Set(list.map((c) => c.id).filter(Boolean));
  const names = new Set(list.map((c) => normalizeText(c.name)).filter(Boolean));
  const byId = new Map(list.filter((c) => c.id).map((c) => [c.id, c]));
  const byName = new Map(list.filter((c) => c.name).map((c) => [normalizeText(c.name), c]));
  return Object.freeze({ list, size: list.length, ids, names, byId, byName });
};

const findBlockedChannel = (index, { id, name }) => {
  const byId = id && index.ids.has(id) ? index.byId.get(id) : undefined;
  if (byId) return byId;
  const key = normalizeText(name);
  return key && index.names.has(key) ? index.byName.get(key) : undefined;
};

const first = (values) => values.find(Boolean) ?? null;

const parseChannelId = (value) => {
  const text = typeof value === "string" ? value : "";
  const match = text.match(/\/channel\/(UC[\w-]{16,})/);
  return match?.[1] ?? "";
};

const isWatchPath = (path) => String(path ?? "").startsWith("/watch");

const isChannelishPath = (path) => {
  const p = String(path ?? "");
  return p.startsWith("/channel/") || p.startsWith("/@") || p.startsWith("/c/") || p.startsWith("/user/");
};

const isEligibleForOverlayScan = (path) => isWatchPath(path) || isChannelishPath(path);

const getLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const getCurrentChannel = () => {
  const path = location.pathname ?? "";
  const fromPath = parseChannelId(path);
  const fromMeta = document.querySelector('meta[itemprop="channelId"]')?.getAttribute("content") ?? "";
  const fromOwner = parseChannelId(
    document
      .querySelector("ytd-video-owner-renderer a[href*='/channel/'], ytd-channel-name a[href*='/channel/']")
      ?.getAttribute("href") ?? ""
  );
  const id = fromPath || fromMeta || fromOwner;

  const nameNodes = [
    document.querySelector("ytd-channel-name #text-container"),
    document.querySelector("#channel-name"),
    document.querySelector("ytd-video-owner-renderer ytd-channel-name #text-container"),
    document.querySelector("ytd-video-owner-renderer a[href^='/channel/']"),
    document.querySelector("ytd-video-owner-renderer a[href^='/@']")
  ];
  const name = (first(nameNodes)?.textContent ?? "").trim();

  return { id, name };
};

const ensureInjectedScript = () => {
  const id = config.injectedScriptTagId;
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.src = chrome.runtime.getURL(config.injectedScriptFile);
  script.type = "text/javascript";
  script.async = false;
  (document.head ?? document.documentElement).appendChild(script);
};

const compileRulesForInjected = (index) => {
  const channelId = index.list
    .map((c) => c.id)
    .filter(Boolean)
    .map((id) => [`^${escapeRegExp(id)}$`, ""]);

  const channelName = index.list
    .map((c) => c.name)
    .filter(Boolean)
    .map((name) => [`^${escapeRegExp(name)}$`, "i"]);

  return {
    filterData: { channelId, channelName },
    options: { block_message: "Blocked by SelloutShield" }
  };
};

const writeRulesCache = (rules) => safeCall(() => localStorage.setItem(config.cacheKey, JSON.stringify(rules)));

const postRulesToPage = (rules) =>
  safeCall(() => {
    if (!rules) return;
    window.postMessage(
      { from: config.postMessage.fromContent, type: config.postMessage.types.storageData, data: rules },
      document.location.origin
    );
  });

const createRafScheduler = (fn) => {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
};

const getIconUrl = () =>
  safeCall(
    () =>
      typeof chrome !== "undefined" && chrome?.runtime?.getURL ? chrome.runtime.getURL("assets/icon.png") : "",
    ""
  );

const renderOverlay = (payload) => {
  const existing = document.getElementById(config.overlayId);
  const overlay = existing ?? Object.assign(document.createElement("div"), { id: config.overlayId });

  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483647";
  overlay.style.display = payload ? "flex" : "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "24px";
  overlay.style.background = "rgba(10, 10, 12, 0.92)";
  overlay.style.color = "#ffffff";
  overlay.style.fontFamily =
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

  const iconUrl = getIconUrl();
  safeCall(() => {
    overlay.dataset.selloutshieldIconUrl = iconUrl;
  });

  if (!payload) overlay.innerHTML = "";
  else {
    const title = "Blocked by SelloutShield";
    const channelLine = payload?.name ? `Channel: ${escapeHtml(payload.name)}` : "";
    const ownerLine = payload?.owner ? `Owner: ${escapeHtml(payload.owner)}` : "";

    overlay.innerHTML = `
      <div style="max-width: 520px; width: 100%; background: rgba(24,24,28,0.9); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 18px 16px; box-shadow: 0 20px 70px rgba(0,0,0,0.55);">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${
            iconUrl
              ? `<img src="${iconUrl}" alt="" style="width: 28px; height: 28px; object-fit: contain;" onerror="this.remove();" />`
              : ""
          }
          <div style="font-weight: 700; font-size: 16px; letter-spacing: 0.2px;">${title}</div>
        </div>
        <div style="margin-top: 10px; font-size: 13px; line-height: 1.4; color: rgba(255,255,255,0.84);">
          ${[channelLine, ownerLine].filter(Boolean).join("<br />")}
        </div>
        <div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="https://www.youtube.com/" style="display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 12px; border-radius: 10px; background: rgba(255,255,255,0.12); color: #fff; text-decoration: none; font-weight: 600; font-size: 13px;">Go to Home</a>
          <a href="${location.href}" style="display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 12px; border-radius: 10px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); text-decoration: none; font-weight: 600; font-size: 13px;">Refresh</a>
        </div>
      </div>
    `;
  }

  if (!existing) (document.body ?? document.documentElement).appendChild(overlay);

  const app = document.querySelector("ytd-app");
  if (app) app.style.setProperty("visibility", payload ? "hidden" : "visible", "important");
};

const createOverlayController = () => {
  const empty = () => ({ forced: { payload: null, until: 0 }, pending: { payload: null, until: 0 } });
  let state = empty();

  const reduce = ({ now, path, fallbackPayload, event }) => {
    const isWatch = isWatchPath(path);

    if (event?.type === "playerBlocked") {
      const payload = event.payload ?? null;
      if (isWatch) {
        state = { forced: { payload, until: now + config.overlayTimersMs.forced }, pending: { payload: null, until: 0 } };
        return payload;
      }
      state = { forced: state.forced, pending: { payload, until: now + config.overlayTimersMs.pending } };
      return null;
    }

    if (state.pending.payload && isWatch && now < state.pending.until) {
      state = { forced: { payload: state.pending.payload, until: now + config.overlayTimersMs.forced }, pending: { payload: null, until: 0 } };
      return state.forced.payload;
    }

    if (state.pending.payload && now >= state.pending.until) state = { forced: state.forced, pending: { payload: null, until: 0 } };

    if (state.forced.payload && isWatch && now < state.forced.until) return state.forced.payload;

    if (!isWatch || (state.forced.payload && now >= state.forced.until)) state = { forced: { payload: null, until: 0 }, pending: state.pending };

    return fallbackPayload;
  };

  return Object.freeze({
    render: (input) => renderOverlay(reduce(input))
  });
};

let blockIndex = buildBlockIndex([]);
let compiledRules = null;
const overlay = createOverlayController();

const refreshFromStorage = async () => {
  const data = await getLocal([config.storageKey]);
  blockIndex = buildBlockIndex(data[config.storageKey]);
  compiledRules = compileRulesForInjected(blockIndex);
  writeRulesCache(compiledRules);
  postRulesToPage(compiledRules);
};

const getFallbackOverlayPayload = () => {
  const path = location.pathname ?? "";
  if (!isEligibleForOverlayScan(path)) return null;
  const blocked = findBlockedChannel(blockIndex, getCurrentChannel());
  return blocked ? { name: blocked.name, owner: blocked.owner } : null;
};

const updateOverlay = () => {
  const now = Date.now();
  const path = location.pathname ?? "";
  overlay.render({ now, path, fallbackPayload: getFallbackOverlayPayload(), event: null });
};

const run = async () => {
  ensureInjectedScript();

  await refreshFromStorage();
  updateOverlay();

  const scheduleOverlay = createRafScheduler(updateOverlay);

  window.addEventListener(
    "message",
    (event) => {
      safeCall(() => {
        if (event.source !== window) return;
        if (event.data?.from !== config.postMessage.fromPage) return;
        const type = event.data?.type ?? "";

        if (type === config.postMessage.types.ready) {
          postRulesToPage(compiledRules);
          return;
        }

        if (type === config.postMessage.types.playerBlocked) {
          const data = event.data?.data ?? {};
          const channelId = typeof data.channelId === "string" ? data.channelId : "";
          const channelName = typeof data.channelName === "string" ? data.channelName : "";
          const blocked = findBlockedChannel(blockIndex, { id: channelId, name: channelName });
          const payload = blocked ? { name: blocked.name, owner: blocked.owner } : { name: channelName, owner: "" };

          overlay.render({
            now: Date.now(),
            path: location.pathname ?? "",
            fallbackPayload: getFallbackOverlayPayload(),
            event: { type: "playerBlocked", payload }
          });

          scheduleOverlay();
        }
      });
    },
    true
  );

  window.addEventListener("yt-navigate-finish", scheduleOverlay, { passive: true });
  window.addEventListener("popstate", scheduleOverlay, { passive: true });
  window.addEventListener("hashchange", scheduleOverlay, { passive: true });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!changes?.[config.storageKey]) return;
    blockIndex = buildBlockIndex(changes[config.storageKey].newValue);
    compiledRules = compileRulesForInjected(blockIndex);
    writeRulesCache(compiledRules);
    postRulesToPage(compiledRules);
    scheduleOverlay();
  });
};

run();


