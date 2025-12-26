const CONFIG = Object.freeze({
  storageKey: "selloutshield:blockedChannels",
  overlayId: "selloutshield-overlay",
  injectedScript: "injected.js",
  injectedScriptTagId: "selloutshield-injected-v2",
  cacheKey: "selloutshield:blocktubeCache:v1",
  fromContent: "SELLOUTSHIELD_CONTENT",
  fromPage: "SELLOUTSHIELD_PAGE"
});

const asArray = (value) => (Array.isArray(value) ? value : []);

const attempt = (fn, fallback = undefined) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const normalize = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const escapeRegExp = (value) => String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseChannelIdFromHref = (href) => {
  const value = typeof href === "string" ? href : "";
  const match = value.match(/\/channel\/(UC[\w-]{16,})/);
  return match?.[1] ?? "";
};

const asChannel = (value) =>
  value && typeof value === "object"
    ? {
        id: typeof value.id === "string" ? value.id.trim() : "",
        name: typeof value.name === "string" ? value.name.trim() : "",
        owner: typeof value.owner === "string" ? value.owner.trim() : ""
      }
    : { id: "", name: "", owner: "" };

const createIndex = (channels) => {
  const list = asArray(channels).map(asChannel);
  const ids = new Set(list.map((c) => c.id).filter(Boolean));
  const names = new Set(list.map((c) => normalize(c.name)).filter(Boolean));
  const byId = new Map(list.filter((c) => c.id).map((c) => [c.id, c]));
  const byName = new Map(list.filter((c) => c.name).map((c) => [normalize(c.name), c]));
  return Object.freeze({ ids, names, byId, byName, size: list.length, list });
};

const findBlocked = (index, { id, name }) => {
  const idHit = id && index.ids.has(id) ? index.byId.get(id) : undefined;
  if (idHit) return idHit;
  const key = normalize(name);
  const nameHit = key && index.names.has(key) ? index.byName.get(key) : undefined;
  return nameHit;
};

const first = (values) => values.find(Boolean) ?? null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isWatchPath = (path) => String(path ?? "").startsWith("/watch");

const ensureOverlay = (payload) => {
  const existing = document.getElementById(CONFIG.overlayId);
  const overlay =
    existing ??
    Object.assign(document.createElement("div"), {
      id: CONFIG.overlayId
    });

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

  const iconUrl = attempt(
    () =>
      typeof chrome !== "undefined" && chrome?.runtime?.getURL ? chrome.runtime.getURL("assets/icon.png") : "",
    ""
  );

  const title = payload ? "Blocked by SelloutShield" : "";
  const channelLine = payload?.name ? `Channel: ${escapeHtml(payload.name)}` : "";
  const ownerLine = payload?.owner ? `Owner: ${escapeHtml(payload.owner)}` : "";

  attempt(() => {
    overlay.dataset.selloutshieldIconUrl = iconUrl;
  });

  overlay.innerHTML = payload
    ? `
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
    `
    : "";

  if (!existing) (document.body ?? document.documentElement).appendChild(overlay);
  const app = document.querySelector("ytd-app");
  if (app) app.style.setProperty("visibility", payload ? "hidden" : "visible", "important");
  return overlay;
};

const getCurrentChannel = () => {
  const path = location.pathname ?? "";
  const fromPath = parseChannelIdFromHref(path);
  const fromMeta = document.querySelector('meta[itemprop="channelId"]')?.getAttribute("content") ?? "";
  const fromOwnerAnchor = parseChannelIdFromHref(
    document
      .querySelector("ytd-video-owner-renderer a[href*='/channel/'], ytd-channel-name a[href*='/channel/']")
      ?.getAttribute("href") ?? ""
  );
  const id = fromPath || fromMeta || fromOwnerAnchor;

  const channelNameNodes = [
    document.querySelector("ytd-channel-name #text-container"),
    document.querySelector("#channel-name"),
    document.querySelector("ytd-video-owner-renderer ytd-channel-name #text-container"),
    document.querySelector("ytd-video-owner-renderer a[href^='/channel/']"),
    document.querySelector("ytd-video-owner-renderer a[href^='/@']")
  ];
  const name = (first(channelNameNodes)?.textContent ?? "").trim();

  return { id, name };
};

const isPotentialChannelOrWatchPage = () => {
  const path = location.pathname ?? "";
  return (
    path.startsWith("/channel/") ||
    path.startsWith("/@") ||
    path.startsWith("/c/") ||
    path.startsWith("/user/") ||
    path.startsWith("/watch")
  );
};

const createScheduler = (fn) => {
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

const getLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const injectMainWorldFallback = () => {
  const id = CONFIG.injectedScriptTagId;
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.src = chrome.runtime.getURL(CONFIG.injectedScript);
  script.type = "text/javascript";
  script.async = false;
  (document.head ?? document.documentElement).appendChild(script);
};

const compileForInjectedEngine = (channelsIndex) => {
  const ids = channelsIndex.list.map((c) => c.id).filter(Boolean);
  const names = channelsIndex.list.map((c) => c.name).filter(Boolean);

  const channelId = ids.map((id) => [`^${escapeRegExp(id)}$`, ""]);
  const channelName = names.map((name) => [`^${escapeRegExp(name)}$`, "i"]);

  return {
    filterData: {
      channelId,
      channelName
    },
    options: {
      block_message: "Blocked by SelloutShield"
    }
  };
};

let index = createIndex([]);
let compiled = null;

const overlayDurationMs = Object.freeze({
  forced: 10 * 60 * 1000,
  pending: 2000
});

const emptyOverlayState = () =>
  Object.freeze({
    forced: { payload: null, until: 0 },
    pending: { payload: null, until: 0 }
  });

let overlayState = emptyOverlayState();

const cacheCompiled = (value) => {
  attempt(() => localStorage.setItem(CONFIG.cacheKey, JSON.stringify(value)));
};

const sendCompiledToPage = () => {
  attempt(() => {
    if (!compiled) return;
    window.postMessage({ from: CONFIG.fromContent, type: "storageData", data: compiled }, document.location.origin);
  });
};

const refreshFromStorage = async () => {
  const data = await getLocal([CONFIG.storageKey]);
  index = createIndex(data[CONFIG.storageKey]);
  compiled = compileForInjectedEngine(index);
  cacheCompiled(compiled);
  sendCompiledToPage();
};

const getBlockedOverlayPayload = () => {
  const blocked = isPotentialChannelOrWatchPage() ? findBlocked(index, getCurrentChannel()) : undefined;
  return blocked ? { name: blocked.name, owner: blocked.owner } : null;
};

const resolveOverlayFromState = ({ state, now, path, fallbackPayload }) => {
  const isWatch = isWatchPath(path);
  const pending = state.pending;
  const forced = state.forced;

  if (pending.payload && now < pending.until && isWatch) {
    const nextState = {
      forced: { payload: pending.payload, until: now + overlayDurationMs.forced },
      pending: { payload: null, until: 0 }
    };
    return { state: nextState, overlayPayload: pending.payload };
  }

  const clearedPending =
    pending.payload && now >= pending.until ? { forced, pending: { payload: null, until: 0 } } : state;

  const afterPendingForced = clearedPending.forced;
  const forceActive = afterPendingForced.payload && isWatch && now < afterPendingForced.until;
  if (forceActive) return { state: clearedPending, overlayPayload: afterPendingForced.payload };

  const clearedForced =
    !isWatch || now >= afterPendingForced.until
      ? { forced: { payload: null, until: 0 }, pending: clearedPending.pending }
      : clearedPending;

  return { state: clearedForced, overlayPayload: fallbackPayload };
};

const applyPlayerBlockedEvent = ({ state, now, path, payload }) => {
  const isWatch = isWatchPath(path);
  if (isWatch) {
    return {
      state: {
        forced: { payload, until: now + overlayDurationMs.forced },
        pending: { payload: null, until: 0 }
      },
      overlayPayload: payload,
      schedule: false
    };
  }
  return {
    state: {
      forced: state.forced,
      pending: { payload, until: now + overlayDurationMs.pending }
    },
    overlayPayload: null,
    schedule: true
  };
};

const updateOverlay = () => {
  const now = Date.now();
  const path = location.pathname ?? "";
  const fallbackPayload = getBlockedOverlayPayload();
  const result = resolveOverlayFromState({ state: overlayState, now, path, fallbackPayload });
  overlayState = result.state;
  ensureOverlay(result.overlayPayload);
};

const run = async () => {
  injectMainWorldFallback();

  await refreshFromStorage();
  updateOverlay();

  const scheduleOverlay = createScheduler(updateOverlay);

  window.addEventListener(
    "message",
    (event) => {
      attempt(() => {
        if (event.source !== window) return;
        if (event.data?.from !== CONFIG.fromPage) return;
        const type = event.data?.type ?? "";

        if (type === "ready") {
          sendCompiledToPage();
          return;
        }

        if (type === "playerBlocked") {
          const data = event.data?.data ?? {};
          const channelId = typeof data.channelId === "string" ? data.channelId : "";
          const channelName = typeof data.channelName === "string" ? data.channelName : "";
          const blocked = findBlocked(index, { id: channelId, name: channelName });
          const payload = blocked ? { name: blocked.name, owner: blocked.owner } : { name: channelName, owner: "" };

          const now = Date.now();
          const path = location.pathname ?? "";
          const next = applyPlayerBlockedEvent({ state: overlayState, now, path, payload });
          overlayState = next.state;
          if (next.overlayPayload) ensureOverlay(next.overlayPayload);
          if (next.schedule) scheduleOverlay();
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
    if (!changes?.[CONFIG.storageKey]) return;
    index = createIndex(changes[CONFIG.storageKey].newValue);
    compiled = compileForInjectedEngine(index);
    cacheCompiled(compiled);
    sendCompiledToPage();
    scheduleOverlay();
  });
};

run();


