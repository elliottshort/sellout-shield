const config = Object.freeze({
  remoteBlocklistUrl: "https://raw.githubusercontent.com/elliottshort/sellout-shield/main/channels.json",
  refreshAlarm: { name: "selloutshield:blocklist_refresh", periodMinutes: 24 * 60, initialDelayMinutes: 1 },
  mainWorldScriptId: "selloutshield-mainworld-injected-v1",
  storageKeys: Object.freeze({
    blockedChannels: "selloutshield:blockedChannels",
    updatedAt: "selloutshield:blockedChannelsUpdatedAt",
    etag: "selloutshield:blockedChannelsEtag",
    sourceUrl: "selloutshield:blockedChannelsSourceUrl",
    lastError: "selloutshield:blockedChannelsLastError"
  }),
  messageTypes: Object.freeze({
    updateBlocklist: "selloutshield:updateBlocklist",
    getStatus: "selloutshield:getStatus"
  })
});

const asArray = (value) => (Array.isArray(value) ? value : []);

const toChannel = (value) => {
  if (!value || typeof value !== "object") return { id: "", name: "", owner: "" };
  return {
    id: typeof value.id === "string" ? value.id.trim() : "",
    name: typeof value.name === "string" ? value.name.trim() : "",
    owner: typeof value.owner === "string" ? value.owner.trim() : ""
  };
};

const parseBlocklist = (json) =>
  asArray(json?.blockedChannels)
    .map(toChannel)
    .filter((c) => Boolean(c.id || c.name));

const storage = Object.freeze({
  get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
  set: (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve))
});

const nowIso = () => new Date().toISOString();

const readState = async () => {
  const raw = await storage.get([
    config.storageKeys.etag,
    config.storageKeys.blockedChannels,
    config.storageKeys.updatedAt,
    config.storageKeys.lastError
  ]);
  return {
    etag: typeof raw[config.storageKeys.etag] === "string" ? raw[config.storageKeys.etag] : "",
    channels: asArray(raw[config.storageKeys.blockedChannels]).map(toChannel),
    updatedAt: typeof raw[config.storageKeys.updatedAt] === "string" ? raw[config.storageKeys.updatedAt] : "",
    error: typeof raw[config.storageKeys.lastError] === "string" ? raw[config.storageKeys.lastError] : ""
  };
};

const writeState = async ({ channels, updatedAt, etag, sourceUrl, error }) =>
  storage.set({
    ...(channels !== undefined ? { [config.storageKeys.blockedChannels]: channels } : {}),
    ...(updatedAt !== undefined ? { [config.storageKeys.updatedAt]: updatedAt } : {}),
    ...(etag !== undefined ? { [config.storageKeys.etag]: etag } : {}),
    ...(sourceUrl !== undefined ? { [config.storageKeys.sourceUrl]: sourceUrl } : {}),
    ...(error !== undefined ? { [config.storageKeys.lastError]: error } : {})
  });

const fetchJsonWithEtag = async ({ url, etag }) => {
  const headers = etag ? { "If-None-Match": etag } : undefined;
  const response = await fetch(url, { headers, cache: "no-store" });

  if (response.status === 304) return { unchanged: true, etag };
  if (!response.ok) throw new Error(`Blocklist fetch failed (${response.status})`);

  const nextEtag = response.headers.get("etag") ?? "";
  const json = await response.json();
  return { unchanged: false, etag: nextEtag, json };
};

const loadPackagedBlocklist = async () => {
  const url = chrome.runtime.getURL("channels.json");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Packaged channels.json load failed (${response.status})`);
  const json = await response.json();
  return { sourceUrl: url, channels: parseBlocklist(json) };
};

const updateBlocklist = async ({ forceFetch = false } = {}) => {
  const current = await readState();
  if (!forceFetch && current.channels.length > 0) {
    return { updated: false, count: current.channels.length, updatedAt: current.updatedAt, error: current.error };
  }

  try {
    const result = await fetchJsonWithEtag({ url: config.remoteBlocklistUrl, etag: current.etag });

    if (result.unchanged) {
      const updatedAt = nowIso();
      await writeState({ updatedAt, sourceUrl: config.remoteBlocklistUrl, error: "" });
      return { updated: false, count: current.channels.length, updatedAt, error: "" };
    }

    const updatedAt = nowIso();
    const channels = parseBlocklist(result.json);
    await writeState({
      channels,
      updatedAt,
      etag: result.etag,
      sourceUrl: config.remoteBlocklistUrl,
      error: ""
    });
    return { updated: true, count: channels.length, updatedAt, error: "" };
  } catch (error) {
    try {
      const packaged = await loadPackagedBlocklist();
      const updatedAt = nowIso();
      await writeState({ channels: packaged.channels, updatedAt, etag: "", sourceUrl: packaged.sourceUrl, error: "" });
      return { updated: true, count: packaged.channels.length, updatedAt, error: "" };
    } catch (fallbackError) {
      await writeState({ error: String(fallbackError?.message ?? fallbackError ?? error ?? "Unknown error") });
      return {
        updated: false,
        count: current.channels.length,
        updatedAt: current.updatedAt,
        error: String(error?.message ?? error ?? "Unknown error")
      };
    }
  }
};

const ensureMainWorldScript = async () => {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts?.some((s) => s?.id === config.mainWorldScriptId)) return;
    await chrome.scripting.registerContentScripts([
      {
        id: config.mainWorldScriptId,
        matches: ["https://www.youtube.com/*"],
        js: ["injected.js"],
        runAt: "document_start",
        world: "MAIN"
      }
    ]);
  } catch {
  }
};

const ensureRefreshAlarm = () =>
  chrome.alarms.create(config.refreshAlarm.name, {
    periodInMinutes: config.refreshAlarm.periodMinutes,
    delayInMinutes: config.refreshAlarm.initialDelayMinutes
  });

chrome.runtime.onInstalled.addListener(async () => {
  ensureRefreshAlarm();
  await ensureMainWorldScript();
  await updateBlocklist({ forceFetch: true });
});

chrome.runtime.onStartup?.addListener?.(async () => {
  await ensureMainWorldScript();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm?.name !== config.refreshAlarm.name) return;
  await updateBlocklist({ forceFetch: true });
});

const messageHandlers = Object.freeze({
  [config.messageTypes.updateBlocklist]: async () => updateBlocklist({ forceFetch: true }),
  [config.messageTypes.getStatus]: async () => {
    const state = await readState();
    return { count: state.channels.length, updatedAt: state.updatedAt, error: state.error };
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type ?? "";
  const handler = messageHandlers[type];
  if (!handler) return false;
  handler().then(sendResponse);
  return true;
});


