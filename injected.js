(function selloutShieldInjector() {
  "use strict";

  if (window.__selloutshieldInjectedV2) return;
  window.__selloutshieldInjectedV2 = true;

  const has = Object.prototype.hasOwnProperty;

  const CONFIG = Object.freeze({
    fromContent: "SELLOUTSHIELD_CONTENT",
    fromPage: "SELLOUTSHIELD_PAGE",
    storageMessageType: "storageData",
    readyMessageType: "ready",
    cacheKey: "selloutshield:blocktubeCache:v1"
  });

  const attempt = (fn, fallback = undefined) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  function defineProperty(chain, cValue, middleware = undefined) {
    let aborted = false;
    const mustAbort = function (v) {
      if (aborted) return true;
      aborted =
        v !== undefined &&
        v !== null &&
        cValue !== undefined &&
        cValue !== null &&
        typeof v !== typeof cValue;
      return aborted;
    };

    const trapProp = function (owner, prop, configurable, handler) {
      if (handler.init(owner[prop]) === false) return;
      const odesc = Object.getOwnPropertyDescriptor(owner, prop);
      let prevGetter, prevSetter;
      if (odesc instanceof Object) {
        if (odesc.configurable === false) return;
        if (odesc.get instanceof Function) prevGetter = odesc.get;
        if (odesc.set instanceof Function) prevSetter = odesc.set;
      }
      Object.defineProperty(owner, prop, {
        configurable,
        get() {
          if (prevGetter !== undefined) prevGetter();
          return handler.getter();
        },
        set(a) {
          if (prevSetter !== undefined) prevSetter(a);
          handler.setter(a);
        }
      });
    };

    const trapChain = function (owner, chain_) {
      const pos = chain_.indexOf(".");
      if (pos === -1) {
        trapProp(owner, chain_, true, {
          v: undefined,
          init: function (v) {
            if (mustAbort(v)) return false;
            this.v = v;
            return true;
          },
          getter: function () {
            return cValue;
          },
          setter: function (a) {
            if (middleware instanceof Function) {
              cValue = a;
              middleware(a);
            } else {
              if (mustAbort(a) === false) return;
              cValue = a;
            }
          }
        });
        return;
      }
      const prop = chain_.slice(0, pos);
      const v = owner[prop];
      const nextChain = chain_.slice(pos + 1);
      if (v instanceof Object || (typeof v === "object" && v !== null)) {
        trapChain(v, nextChain);
        return;
      }
      trapProp(owner, prop, true, {
        v: undefined,
        init: function (vv) {
          this.v = vv;
          return true;
        },
        getter: function () {
          return this.v;
        },
        setter: function (a) {
          this.v = a;
          if (a instanceof Object) trapChain(a, nextChain);
        }
      });
    };

    trapChain(window, chain);
  }

  function flattenRuns(arr) {
    if (!arr) return "";
    if (arr.simpleText !== undefined) return String(arr.simpleText ?? "");
    if (!(arr.runs instanceof Array)) return String(arr ?? "");
    return arr.runs
      .reduce((res, v) => {
        if (has.call(v, "text")) res.push(v.text);
        return res;
      }, [])
      .join(" ");
  }

  function getObjectByPath(obj, path, def = undefined) {
    const paths = path instanceof Array ? path : String(path).split(".");
    let nextObj = obj;

    const exist = paths.every((v) => {
      if (/\[.*\]/.test(v)) {
        const baseMatch = v.match(/^([^\[]+)/);
        const idxMatches = [...v.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10));

        if (baseMatch && baseMatch[1]) {
          const key = baseMatch[1];
          if (!nextObj || !has.call(nextObj, key)) return false;
          nextObj = nextObj[key];
        }
        for (let k = 0; k < idxMatches.length; k += 1) {
          const idx = idxMatches[k];
          if (!Array.isArray(nextObj) || idx < 0 || idx >= nextObj.length) return false;
          nextObj = nextObj[idx];
        }
        return true;
      }

      if (nextObj instanceof Array) {
        const found = nextObj.find((o) => o && typeof o === "object" && has.call(o, v));
        if (found === undefined) return false;
        nextObj = found[v];
      } else {
        if (!nextObj || !has.call(nextObj, v)) return false;
        nextObj = nextObj[v];
      }
      return true;
    });

    return exist ? nextObj : def;
  }

  function getFlattenByPath(obj, filterPath) {
    if (filterPath === undefined) return undefined;
    const filterPathArr = filterPath instanceof Array ? filterPath : [filterPath];
    for (let idx = 0; idx < filterPathArr.length; idx += 1) {
      const value = getObjectByPath(obj, filterPathArr[idx]);
      if (value !== undefined) return flattenRuns(value);
    }
    return undefined;
  }

  const regexProps = ["channelId", "channelName"];

  let storageData;

  function compileRegExpList(values) {
    const arr = Array.isArray(values) ? values : [];
    const out = [];
    for (const v of arr) {
      try {
        if (v instanceof RegExp) {
          out.push(v);
          continue;
        }
        if (Array.isArray(v) && typeof v[0] === "string") {
          out.push(RegExp(v[0], String(v[1] ?? "").replace("g", "")));
          continue;
        }
        if (typeof v === "string") {
          out.push(RegExp(`^${v}$`, ""));
        }
      } catch {
      }
    }
    return out;
  }

  function compileStorageData(data) {
    const filterData = data && typeof data === "object" ? data.filterData : undefined;
    const options = data && typeof data === "object" ? data.options : undefined;
    const compiled = {
      filterData: {
        channelId: compileRegExpList(filterData?.channelId),
        channelName: compileRegExpList(filterData?.channelName)
      },
      options: options && typeof options === "object" ? options : {}
    };
    return compiled;
  }

  function storageReceived(data) {
    if (!data) {
      storageData = undefined;
      return;
    }
    try {
      storageData = compileStorageData(data);
      startHook();
      window.dispatchEvent(new Event("selloutShieldReady"));
    } catch {
    }
  }

  function isDataEmpty() {
    if (!storageData || !storageData.filterData) return true;
    return regexProps.every((p) => !Array.isArray(storageData.filterData[p]) || storageData.filterData[p].length === 0);
  }

  const baseRules = Object.freeze({
    channelId: "shortBylineText.runs.navigationEndpoint.browseEndpoint.browseId",
    channelName: ["shortBylineText", "longBylineText", "ownerText", "bylineText"]
  });

  const filterRules = Object.freeze({
    main: {
      videoRenderer: baseRules,
      gridVideoRenderer: baseRules,
      compactVideoRenderer: baseRules,
      playlistVideoRenderer: baseRules,
      playlistPanelVideoRenderer: baseRules,
      radioRenderer: baseRules,
      compactRadioRenderer: baseRules,
      playlistRenderer: baseRules,
      compactPlaylistRenderer: baseRules,
      gridPlaylistRenderer: baseRules,
      reelItemRenderer: baseRules,
      videoWithContextRenderer: baseRules,
      endScreenVideoRenderer: baseRules,
      endScreenPlaylistRenderer: baseRules,
      watchCardCompactVideoRenderer: {
        channelId: "subtitles.runs.navigationEndpoint.browseEndpoint.browseId",
        channelName: "subtitles"
      },
      channelRenderer: {
        channelId: ["channelId", "navigationEndpoint.browseEndpoint.browseId"],
        channelName: ["title", "shortBylineText"]
      },
      gridChannelRenderer: {
        channelId: "channelId",
        channelName: "title"
      },
      miniChannelRenderer: {
        channelId: "channelId",
        channelName: "title"
      },
      lockupViewModel: {
        channelId: [
          "metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel.rendererContext.commandContext.onTap.innertubeCommand.browseEndpoint.browseId",
          "metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows.metadataParts.text.commandRuns.onTap.innertubeCommand.browseEndpoint.browseId"
        ],
        channelName: "metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows.metadataParts.text.content"
      }
    },
    guide: {
      guideEntryRenderer: {
        channelId: ["navigationEndpoint.browseEndpoint.browseId", "icon.iconType"],
        channelName: ["title", "formattedTitle"]
      }
    },
    ytPlayer: {
      videoDetails: {
        properties: {
          channelId: "channelId",
          channelName: "author"
        },
        customFunc: disablePlayer
      },
      args: {
        properties: {
          channelId: ["ucid", "raw_player_response.videoDetails.channelId"],
          channelName: ["author", "raw_player_response.videoDetails.author"]
        },
        customFunc: disableEmbedPlayer
      },
      PLAYER_VARS: {
        properties: {
          channelId: [
            "ucid",
            "raw_player_response.videoDetails.channelId",
            "raw_player_response.embedPreview.thumbnailPreviewRenderer.videoDetails.embeddedPlayerOverlayVideoDetailsRenderer.expandedRenderer.embeddedPlayerOverlayVideoDetailsExpandedRenderer.subscribeButton.subscribeButtonRenderer.channelId"
          ],
          channelName: ["author", "raw_player_response.videoDetails.author"]
        },
        customFunc: disableEmbedPlayer
      }
    }
  });

  const deleteAllowed = [
    "richItemRenderer",
    "content",
    "horizontalListRenderer",
    "verticalListRenderer",
    "shelfRenderer",
    "richShelfRenderer",
    "gridRenderer",
    "expandedShelfContentsRenderer",
    "reelShelfRenderer",
    "richSectionRenderer"
  ];

  function matchFilterData(filters, obj, objectType) {
    if (isDataEmpty()) return false;
    if (!filters || typeof filters !== "object") return false;

    const rules = has.call(filters, "properties") ? filters.properties : filters;

    return Object.keys(rules).some((h) => {
      const filterPath = rules[h];
      if (filterPath === undefined) return false;
      if (!regexProps.includes(h)) return false;

      const patterns = storageData?.filterData?.[h];
      if (!Array.isArray(patterns) || patterns.length === 0) return false;

      const value = getFlattenByPath(obj, filterPath);
      if (value === undefined) return false;

      try {
        return patterns.some((re) => re && re.test(String(value)));
      } catch {
        return false;
      }
    });
  }

  function matchFilterRule(obj, filterRules_) {
    if (isDataEmpty()) return [];
    return Object.keys(filterRules_).reduce((res, h) => {
      let properties;
      let customFunc;
      const filteredObject = obj[h];
      if (!filteredObject) return res;

      const filterRule = filterRules_[h];
      if (filterRule && typeof filterRule === "object" && has.call(filterRule, "properties")) {
        properties = filterRule.properties;
        customFunc = filterRule.customFunc;
      } else {
        properties = filterRule;
        customFunc = undefined;
      }

      const isMatch = matchFilterData(properties, filteredObject, h);
      if (isMatch) res.push({ name: h, customFunc });
      return res;
    }, []);
  }

  function filterObjectWithRules(obj, filterRules_) {
    let deletePrev = false;
    if (typeof obj !== "object" || obj === null) return deletePrev;

    const matchedRules = matchFilterRule(obj, filterRules_);
    matchedRules.forEach((r) => {
      let customRet = true;
      if (r.customFunc !== undefined) customRet = r.customFunc(obj, r.name);
      if (customRet) {
        try {
          delete obj[r.name];
        } catch {
        }
        deletePrev = true;
      }
    });

    let len = 0;
    let keys;
    if (obj instanceof Array) {
      len = obj.length;
    } else {
      keys = Object.keys(obj);
      len = keys.length;
    }

    for (let i = len - 1; i >= 0; i -= 1) {
      const idx = keys ? keys[i] : i;
      if (obj[idx] === undefined) continue;
      const childDel = filterObjectWithRules(obj[idx], filterRules_);
      if (childDel && keys === undefined) {
        deletePrev = true;
        obj.splice(idx, 1);
      }
      if (obj[idx] instanceof Array && obj[idx].length === 0 && childDel) {
        deletePrev = true;
      } else if (childDel && deleteAllowed.includes(idx)) {
        try {
          delete obj[idx];
        } catch {
        }
        deletePrev = true;
      }
    }
    return deletePrev;
  }

  function filterObject(obj, rules) {
    return attempt(() => (filterObjectWithRules(obj, rules), obj), obj);
  }

  function disableEmbedPlayer() {
    return true;
  }

  function disablePlayer(ytData) {
    try {
      const message = (storageData?.options?.block_message || "Blocked by SelloutShield") + "";

      try {
        const channelId = String(ytData?.videoDetails?.channelId ?? "");
        const channelName = String(ytData?.videoDetails?.author ?? "");
        window.postMessage(
          {
            from: CONFIG.fromPage,
            type: "playerBlocked",
            data: { channelId, channelName, message }
          },
          document.location.origin
        );
      } catch {
      }

      for (const prop of Object.getOwnPropertyNames(ytData)) {
        try {
          delete ytData[prop];
        } catch {
        }
      }
      ytData.playabilityStatus = {
        status: "ERROR",
        reason: message,
        errorScreen: {
          playerErrorMessageRenderer: {
            reason: { simpleText: message },
            icon: { iconType: "ERROR_OUTLINE" }
          }
        }
      };
      return false;
    } catch {
      return false;
    }
  }

  function filterInitialData(v) {
    return filterObject(v, filterRules.main);
  }

  function filterGuideData(v) {
    return filterObject(v, filterRules.guide);
  }

  function filterPlayerResponse(v) {
    return filterObject(v, filterRules.ytPlayer);
  }

  function startHook() {
    const trap = (chain, filterFn) => {
      try {
        const existing = getObjectByPath(window, chain);
        if (existing !== undefined) {
          defineProperty(chain, existing, (v) => filterFn(v));
          if (existing && typeof existing === "object") filterFn(existing);
          return;
        }
      } catch {
      }
      try {
        defineProperty(chain, undefined, (v) => filterFn(v));
      } catch {
      }
    };

    trap("ytInitialData", filterInitialData);
    trap("ytInitialGuideData", filterGuideData);
    trap("ytInitialPlayerResponse", filterPlayerResponse);
    trap("ytplayer.config", filterPlayerResponse);
    trap("yt.config_", filterPlayerResponse);
  }

  function shouldProcessUrl(url) {
    const u = String(url ?? "");
    return (
      u.includes("/youtubei/v1/search") ||
      u.includes("/youtubei/v1/browse") ||
      u.includes("/youtubei/v1/next") ||
      u.includes("/youtubei/v1/guide") ||
      u.includes("/youtubei/v1/player")
    );
  }

  function applyFilterForUrl(urlString_, json) {
    try {
      const url = new URL(String(urlString_ ?? ""), document.location.origin);
      switch (url.pathname) {
        case "/youtubei/v1/search":
        case "/youtubei/v1/browse":
        case "/youtubei/v1/next":
          filterObject(json, filterRules.main);
          break;
        case "/youtubei/v1/guide":
          filterObject(json, filterRules.guide);
          break;
        case "/youtubei/v1/player":
          filterObject(json, filterRules.ytPlayer);
          break;
        default:
          break;
      }
    } catch {
    }
    return json;
  }

  function urlString(input) {
    try {
      if (typeof input === "string") return input;
      if (input && typeof input === "object" && "url" in input) return String(input.url ?? "");
      return "";
    } catch {
      return "";
    }
  }

  function patchFetch() {
    let original;
    try {
      if (typeof window.fetch !== "function") return;
      original = window.fetch.bind(window);
    } catch {
      return;
    }

    const wrapped = async (...args) => {
      const res = await original(...args);
      try {
        const url = urlString(args[0]);
        if (!shouldProcessUrl(url)) return res;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json")) return res;
        const cloned = res.clone();
        const data = await cloned.json();
        const filtered = applyFilterForUrl(url, data);
        const body = JSON.stringify(filtered);
        const headers = new Headers(res.headers);
        headers.set("content-length", String(body.length));
        return new Response(body, {
          status: res.status,
          statusText: res.statusText,
          headers
        });
      } catch {
        return res;
      }
    };

    try {
      const desc = Object.getOwnPropertyDescriptor(window, "fetch");
      if (!desc) {
        Object.defineProperty(window, "fetch", {
          configurable: true,
          enumerable: true,
          writable: true,
          value: wrapped
        });
        return;
      }

      if (desc.writable) {
        window.fetch = wrapped;
        return;
      }

      if (desc.configurable) {
        Object.defineProperty(window, "fetch", { ...desc, value: wrapped });
        return;
      }
    } catch {
    }
  }

  function patchXhr() {
    if (!window.XMLHttpRequest) return;
    const open = window.XMLHttpRequest.prototype.open;
    const send = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (...args) {
      try {
        this.__selloutshieldUrl = String(args?.[1] ?? "");
      } catch {
        this.__selloutshieldUrl = "";
      }
      return open.apply(this, args);
    };
    window.XMLHttpRequest.prototype.send = function (...args) {
      const url = this.__selloutshieldUrl ?? "";
      if (!shouldProcessUrl(url)) return send.apply(this, args);

      const patch = () => {
        try {
          if (this.readyState !== 4) return;
          if (this.status < 200 || this.status >= 300) return;
          const type = this.responseType;
          if (type && type !== "" && type !== "text") return;
          const text = this.responseText;
          if (typeof text !== "string" || !text) return;
          const parsed = JSON.parse(text);
          const filtered = applyFilterForUrl(url, parsed);
          const nextText = JSON.stringify(filtered);
          try {
            Object.defineProperty(this, "responseText", { configurable: true, get: () => nextText });
          } catch {
          }
          try {
            Object.defineProperty(this, "response", { configurable: true, get: () => nextText });
          } catch {
          }
        } catch {
        }
      };

      this.addEventListener("readystatechange", patch);
      return send.apply(this, args);
    };
  }

  function loadCachedStorage() {
    try {
      const raw = localStorage.getItem(CONFIG.cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      storageReceived(parsed);
    } catch {
    }
  }

  function onMessage(event) {
    try {
      if (event?.source !== window) return;
      const data = event?.data;
      if (!data || typeof data !== "object") return;
      if (data.from !== CONFIG.fromContent) return;
      if (data.type !== CONFIG.storageMessageType) return;
      storageReceived(data.data);
    } catch {
    }
  }

  loadCachedStorage();
  window.addEventListener("message", onMessage, true);
  patchFetch();
  patchXhr();

  try {
    window.postMessage({ from: CONFIG.fromPage, type: CONFIG.readyMessageType }, document.location.origin);
  } catch {
  }
})();


