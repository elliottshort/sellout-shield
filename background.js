const CONFIG = Object.freeze({
  sourceUrl:
    "https://raw.githubusercontent.com/elliottshort/SelloutShield/main/channels.json",
  alarmName: "selloutshield:blocklist_refresh",
  alarmPeriodMinutes: 24 * 60,
  mainWorldScriptId: "selloutshield-mainworld-injected-v1",
  storageKeys: Object.freeze({
    blockedChannels: "selloutshield:blockedChannels",
    updatedAt: "selloutshield:blockedChannelsUpdatedAt",
    etag: "selloutshield:blockedChannelsEtag",
    sourceUrl: "selloutshield:blockedChannelsSourceUrl",
    lastError: "selloutshield:blockedChannelsLastError"
  })
});

const asArray = (value) => (Array.isArray(value) ? value : []);

const sanitizeChannel = (value) =>
  value && typeof value === "object"
    ? {
        id: typeof value.id === "string" ? value.id.trim() : "",
        name: typeof value.name === "string" ? value.name.trim() : "",
        owner: typeof value.owner === "string" ? value.owner.trim() : ""
      }
    : { id: "", name: "", owner: "" };

const parseBlocklist = (json) =>
  asArray(json?.blockedChannels).map(sanitizeChannel).filter((c) => c.id || c.name);

const getLocal = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const setLocal = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, resolve));

const createAlarm = () =>
  chrome.alarms.create(CONFIG.alarmName, {
    periodInMinutes: CONFIG.alarmPeriodMinutes,
    delayInMinutes: 1
  });

const fetchJson = async ({ url, etag }) => {
  const headers = etag ? { "If-None-Match": etag } : {};
  const response = await fetch(url, { headers, cache: "no-store" });
  const unchanged = response.status === 304;
  const ok = response.ok || unchanged;
  if (!ok) throw new Error(`Blocklist fetch failed (${response.status})`);
  if (unchanged) return { unchanged: true, etag };
  const nextEtag = response.headers.get("etag") ?? "";
  const json = await response.json();
  return { unchanged: false, etag: nextEtag, json };
};

const nowIso = () => new Date().toISOString();

const writeSuccess = async ({ channels, etag, sourceUrl, updatedAt }) =>
  setLocal({
    [CONFIG.storageKeys.blockedChannels]: channels,
    [CONFIG.storageKeys.updatedAt]: updatedAt ?? nowIso(),
    [CONFIG.storageKeys.etag]: etag ?? "",
    [CONFIG.storageKeys.sourceUrl]: sourceUrl ?? CONFIG.sourceUrl,
    [CONFIG.storageKeys.lastError]: ""
  });

const writeFailure = async ({ error }) =>
  setLocal({
    [CONFIG.storageKeys.lastError]: String(error?.message ?? error ?? "Unknown error")
  });

const readState = async () =>
  getLocal([
    CONFIG.storageKeys.etag,
    CONFIG.storageKeys.blockedChannels,
    CONFIG.storageKeys.updatedAt,
    CONFIG.storageKeys.lastError
  ]);

const updateBlocklist = async ({ force = false } = {}) => {
  const state = await readState();
  const etag = typeof state[CONFIG.storageKeys.etag] === "string" ? state[CONFIG.storageKeys.etag] : "";
  const existing = asArray(state[CONFIG.storageKeys.blockedChannels]).map(sanitizeChannel);

  if (!force && existing.length > 0) {
    return {
      updated: false,
      count: existing.length,
      updatedAt: state[CONFIG.storageKeys.updatedAt] ?? "",
      error: state[CONFIG.storageKeys.lastError] ?? ""
    };
  }

  try {
    const result = await fetchJson({ url: CONFIG.sourceUrl, etag });
    if (result.unchanged) {
      const updatedAt = nowIso();
      await setLocal({
        [CONFIG.storageKeys.updatedAt]: updatedAt,
        [CONFIG.storageKeys.sourceUrl]: CONFIG.sourceUrl,
        [CONFIG.storageKeys.lastError]: ""
      });
      return {
        updated: false,
        count: existing.length,
        updatedAt,
        error: ""
      };
    }

    const updatedAt = nowIso();
    const channels = parseBlocklist(result.json);
    await writeSuccess({ channels, etag: result.etag, sourceUrl: CONFIG.sourceUrl, updatedAt });
    return { updated: true, count: channels.length, updatedAt, error: "" };
  } catch (error) {
    try {
      const url = chrome.runtime.getURL("channels.json");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Packaged channels.json load failed (${response.status})`);
      const json = await response.json();
      const updatedAt = nowIso();
      const channels = parseBlocklist(json);
      await writeSuccess({ channels, etag: "", sourceUrl: url, updatedAt });
      return { updated: true, count: channels.length, updatedAt, error: "" };
    } catch (fallbackError) {
      await writeFailure({ error: fallbackError ?? error });
    }
    return {
      updated: false,
      count: existing.length,
      updatedAt: state[CONFIG.storageKeys.updatedAt] ?? "",
      error: String(error?.message ?? error)
    };
  }
};

const ensureMainWorldScript = async () => {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    if (existing?.some((s) => s?.id === CONFIG.mainWorldScriptId)) return;

    await chrome.scripting.registerContentScripts([
      {
        id: CONFIG.mainWorldScriptId,
        matches: ["https://www.youtube.com/*"],
        js: ["injected.js"],
        runAt: "document_start",
        world: "MAIN"
      }
    ]);
  } catch {
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  createAlarm();
  await ensureMainWorldScript();
  await updateBlocklist({ force: true });
});

chrome.runtime.onStartup?.addListener?.(async () => {
  await ensureMainWorldScript();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm?.name !== CONFIG.alarmName) return;
  await updateBlocklist({ force: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type ?? "";
  const respond = (payload) => {
    sendResponse(payload);
    return undefined;
  };

  if (type === "selloutshield:updateBlocklist") {
    updateBlocklist({ force: true }).then(respond);
    return true;
  }

  if (type === "selloutshield:getStatus") {
    readState().then((state) => {
      const channels = asArray(state[CONFIG.storageKeys.blockedChannels]);
      respond({
        count: channels.length,
        updatedAt: state[CONFIG.storageKeys.updatedAt] ?? "",
        error: state[CONFIG.storageKeys.lastError] ?? ""
      });
    });
    return true;
  }

  return false;
});


