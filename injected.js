(function selloutShieldInjector() {
  "use strict";

  if (window.__selloutshieldInjectedV2) return;
  window.__selloutshieldInjectedV2 = true;

  const hasOwn = Object.prototype.hasOwnProperty;

  const config = Object.freeze({
    fromContent: "SELLOUTSHIELD_CONTENT",
    fromPage: "SELLOUTSHIELD_PAGE",
    messageTypes: Object.freeze({ storageData: "storageData", ready: "ready", playerBlocked: "playerBlocked" }),
    cacheKey: "selloutshield:blocktubeCache:v1"
  });

  const safeCall = (fn, fallback = undefined) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const flattenRuns = (value) => {
    if (value === null || value === undefined) return "";
    if (value && typeof value === "object" && value.simpleText !== undefined) return String(value.simpleText ?? "");
    if (!value || !Array.isArray(value.runs)) return String(value ?? "");
    return value.runs
      .reduce((out, part) => {
        if (part && hasOwn.call(part, "text")) out.push(part.text);
        return out;
      }, [])
      .join(" ");
  };

  const parsePathSegments = (path) => {
    const raw = String(path ?? "");
    if (!raw) return [];
    return raw.split(".").filter(Boolean);
  };

  const parseSegment = (segment) => {
    const s = String(segment ?? "");
    const baseMatch = s.match(/^([^\[]+)/);
    const key = baseMatch?.[1] ?? "";
    const indices = [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number.parseInt(m[1], 10)).filter(Number.isFinite);
    return { key, indices };
  };

  const getByPath = (root, path, fallback = undefined) => {
    const segments = Array.isArray(path) ? path : parsePathSegments(path);
    let current = root;

    for (const seg of segments) {
      if (current === null || current === undefined) return fallback;

      const { key, indices } = parseSegment(seg);
      if (!key && indices.length === 0) return fallback;

      if (key) {
        if (Array.isArray(current)) {
          const found = current.find((o) => o && typeof o === "object" && hasOwn.call(o, key));
          if (found === undefined) return fallback;
          current = found[key];
        } else {
          if (!current || !hasOwn.call(current, key)) return fallback;
          current = current[key];
        }
      }

      if (indices.length) {
        for (const idx of indices) {
          if (!Array.isArray(current) || idx < 0 || idx >= current.length) return fallback;
          current = current[idx];
        }
      }
    }

    return current === undefined ? fallback : current;
  };

  const getTextByPath = (obj, pathSpec) => {
    if (pathSpec === undefined) return undefined;
    const paths = Array.isArray(pathSpec) ? pathSpec : [pathSpec];
    for (const p of paths) {
      const value = getByPath(obj, p);
      if (value !== undefined) return flattenRuns(value);
    }
    return undefined;
  };

  const regexKeys = Object.freeze(["channelId", "channelName"]);

  let compiledRules;

  function compilePatternList(values) {
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
        if (typeof v === "string") out.push(RegExp(`^${v}$`, ""));
      } catch {
      }
    }
    return out;
  }

  function compileIncomingRules(data) {
    const filterData = data && typeof data === "object" ? data.filterData : undefined;
    const options = data && typeof data === "object" ? data.options : undefined;
    return {
      filterData: {
        channelId: compilePatternList(filterData?.channelId),
        channelName: compilePatternList(filterData?.channelName)
      },
      options: options && typeof options === "object" ? options : {}
    };
  }

  function isRulesEmpty() {
    if (!compiledRules || !compiledRules.filterData) return true;
    return regexKeys.every((k) => !Array.isArray(compiledRules.filterData[k]) || compiledRules.filterData[k].length === 0);
  }

  function trapProperty(chain, value, onChange = undefined) {
    let aborted = false;

    const abortIfTypeMismatch = (next) => {
      if (aborted) return true;
      aborted =
        next !== undefined &&
        next !== null &&
        value !== undefined &&
        value !== null &&
        typeof next !== typeof value;
      return aborted;
    };

    const defineTrap = (owner, prop, configurable, handler) => {
      if (handler.init(owner[prop]) === false) return;

      const desc = Object.getOwnPropertyDescriptor(owner, prop);
      let prevGet;
      let prevSet;

      if (desc && typeof desc === "object") {
        if (desc.configurable === false) return;
        if (typeof desc.get === "function") prevGet = desc.get;
        if (typeof desc.set === "function") prevSet = desc.set;
      }

      Object.defineProperty(owner, prop, {
        configurable,
        get() {
          if (prevGet) prevGet();
          return handler.getter();
        },
        set(next) {
          if (prevSet) prevSet(next);
          handler.setter(next);
        }
      });
    };

    const trapChain = (owner, chainPath) => {
      const dot = chainPath.indexOf(".");
      if (dot === -1) {
        defineTrap(owner, chainPath, true, {
          stored: undefined,
          init(next) {
            if (abortIfTypeMismatch(next)) return false;
            this.stored = next;
            return true;
          },
          getter() {
            return value;
          },
          setter(next) {
            if (typeof onChange === "function") {
              value = next;
              onChange(next);
              return;
            }
            if (abortIfTypeMismatch(next) === false) return;
            value = next;
          }
        });
        return;
      }

      const prop = chainPath.slice(0, dot);
      const nextChain = chainPath.slice(dot + 1);
      const existing = owner[prop];

      if (existing && typeof existing === "object") {
        trapChain(existing, nextChain);
        return;
      }

      defineTrap(owner, prop, true, {
        stored: undefined,
        init(next) {
          this.stored = next;
          return true;
        },
        getter() {
          return this.stored;
        },
        setter(next) {
          this.stored = next;
          if (next && typeof next === "object") trapChain(next, nextChain);
        }
      });
    };

    trapChain(window, chain);
  }

  function disableEmbedPlayer() {
    return true;
  }

  function disablePlayer(ytData) {
    try {
      const message = String(compiledRules?.options?.block_message || "Blocked by SelloutShield");

      safeCall(() => {
        const channelId = String(ytData?.videoDetails?.channelId ?? "");
        const channelName = String(ytData?.videoDetails?.author ?? "");
        window.postMessage(
          { from: config.fromPage, type: config.messageTypes.playerBlocked, data: { channelId, channelName, message } },
          document.location.origin
        );
      });

      for (const prop of Object.getOwnPropertyNames(ytData)) safeCall(() => delete ytData[prop]);

      ytData.playabilityStatus = {
        status: "ERROR",
        reason: message,
        errorScreen: { playerErrorMessageRenderer: { reason: { simpleText: message }, icon: { iconType: "ERROR_OUTLINE" } } }
      };

      return false;
    } catch {
      return false;
    }
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

  const deleteAllowed = Object.freeze([
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
  ]);

  function matchesAnyRule(properties, node) {
    if (isRulesEmpty()) return false;
    if (!properties || typeof properties !== "object") return false;

    const rules = hasOwn.call(properties, "properties") ? properties.properties : properties;

    return Object.keys(rules).some((key) => {
      const pathSpec = rules[key];
      if (pathSpec === undefined) return false;
      if (!regexKeys.includes(key)) return false;

      const patterns = compiledRules?.filterData?.[key];
      if (!Array.isArray(patterns) || patterns.length === 0) return false;

      const text = getTextByPath(node, pathSpec);
      if (text === undefined) return false;

      return safeCall(() => patterns.some((re) => re && re.test(String(text))), false);
    });
  }

  function matchedKeysForRuleSet(node, ruleSet) {
    if (isRulesEmpty()) return [];
    return Object.keys(ruleSet).reduce((out, key) => {
      const target = node[key];
      if (!target) return out;

      const rule = ruleSet[key];
      const properties = rule && typeof rule === "object" && hasOwn.call(rule, "properties") ? rule.properties : rule;
      const customFunc = rule && typeof rule === "object" && hasOwn.call(rule, "properties") ? rule.customFunc : undefined;

      if (matchesAnyRule(properties, target)) out.push({ key, customFunc });
      return out;
    }, []);
  }

  function filterTreeInPlace(node, ruleSet) {
    let deletedSomething = false;
    if (!node || typeof node !== "object") return deletedSomething;

    const matched = matchedKeysForRuleSet(node, ruleSet);
    for (const m of matched) {
      const shouldDelete = m.customFunc ? m.customFunc(node, m.key) : true;
      if (!shouldDelete) continue;
      safeCall(() => delete node[m.key]);
      deletedSomething = true;
    }

    const isArray = Array.isArray(node);
    const keys = isArray ? null : Object.keys(node);
    const len = isArray ? node.length : keys.length;

    for (let i = len - 1; i >= 0; i -= 1) {
      const key = keys ? keys[i] : i;
      if (node[key] === undefined) continue;

      const childDeleted = filterTreeInPlace(node[key], ruleSet);

      if (childDeleted && !keys) {
        node.splice(key, 1);
        deletedSomething = true;
        continue;
      }

      const child = node[key];
      if (Array.isArray(child) && child.length === 0 && childDeleted) deletedSomething = true;
      else if (childDeleted && deleteAllowed.includes(key)) {
        safeCall(() => delete node[key]);
        deletedSomething = true;
      }
    }

    return deletedSomething;
  }

  function filterObject(obj, ruleSet) {
    return safeCall(() => (filterTreeInPlace(obj, ruleSet), obj), obj);
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

  function startHooks() {
    const trap = (chain, filterFn) => {
      safeCall(() => {
        const existing = getByPath(window, chain);
        if (existing !== undefined) {
          trapProperty(chain, existing, (v) => filterFn(v));
          if (existing && typeof existing === "object") filterFn(existing);
          return;
        }
        trapProperty(chain, undefined, (v) => filterFn(v));
      });
    };

    trap("ytInitialData", filterInitialData);
    trap("ytInitialGuideData", filterGuideData);
    trap("ytInitialPlayerResponse", filterPlayerResponse);
    trap("ytplayer.config", filterPlayerResponse);
    trap("yt.config_", filterPlayerResponse);
  }

  function onRulesReceived(data) {
    if (!data) {
      compiledRules = undefined;
      return;
    }
    safeCall(() => {
      compiledRules = compileIncomingRules(data);
      startHooks();
      window.dispatchEvent(new Event("selloutShieldReady"));
    });
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

  function applyFilterForUrl(urlString, json) {
    safeCall(() => {
      const url = new URL(String(urlString ?? ""), document.location.origin);
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
    });
    return json;
  }

  function urlString(input) {
    return safeCall(() => {
      if (typeof input === "string") return input;
      if (input && typeof input === "object" && "url" in input) return String(input.url ?? "");
      return "";
    }, "");
  }

  function patchFetch() {
    const original = safeCall(() => (typeof window.fetch === "function" ? window.fetch.bind(window) : null), null);
    if (!original) return;

    const wrapped = async (...args) => {
      const res = await original(...args);
      return safeCall(() => {
        if (isRulesEmpty()) return res;
        const url = urlString(args[0]);
        if (!shouldProcessUrl(url)) return res;

        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json")) return res;

        return res
          .clone()
          .json()
          .then((data) => {
            const filtered = applyFilterForUrl(url, data);
            const body = JSON.stringify(filtered);
            const headers = new Headers(res.headers);
            headers.delete("content-length");
            return new Response(body, { status: res.status, statusText: res.statusText, headers });
          })
          .catch(() => res);
      }, res);
    };

    safeCall(() => {
      const desc = Object.getOwnPropertyDescriptor(window, "fetch");
      if (!desc) {
        Object.defineProperty(window, "fetch", { configurable: true, enumerable: true, writable: true, value: wrapped });
        return;
      }
      if (desc.writable) {
        window.fetch = wrapped;
        return;
      }
      if (desc.configurable) Object.defineProperty(window, "fetch", { ...desc, value: wrapped });
    });
  }

  function patchXhr() {
    if (!window.XMLHttpRequest) return;

    const open = window.XMLHttpRequest.prototype.open;
    const send = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (...args) {
      this.__selloutshieldUrl = safeCall(() => String(args?.[1] ?? ""), "");
      return open.apply(this, args);
    };

    window.XMLHttpRequest.prototype.send = function (...args) {
      const url = this.__selloutshieldUrl ?? "";
      if (isRulesEmpty() || !shouldProcessUrl(url)) return send.apply(this, args);

      const patch = () => {
        safeCall(() => {
          if (this.readyState !== 4) return;
          if (this.status < 200 || this.status >= 300) return;
          const type = this.responseType;
          if (type && type !== "" && type !== "text") return;
          const text = this.responseText;
          if (typeof text !== "string" || !text) return;

          const parsed = JSON.parse(text);
          const filtered = applyFilterForUrl(url, parsed);
          const nextText = JSON.stringify(filtered);

          safeCall(() => Object.defineProperty(this, "responseText", { configurable: true, get: () => nextText }));
          safeCall(() => Object.defineProperty(this, "response", { configurable: true, get: () => nextText }));
        });
      };

      this.addEventListener("readystatechange", patch);
      return send.apply(this, args);
    };
  }

  function loadCachedRules() {
    safeCall(() => {
      const raw = localStorage.getItem(config.cacheKey);
      if (!raw) return;
      onRulesReceived(JSON.parse(raw));
    });
  }

  function onMessage(event) {
    safeCall(() => {
      if (event?.source !== window) return;
      const data = event?.data;
      if (!data || typeof data !== "object") return;
      if (data.from !== config.fromContent) return;
      if (data.type !== config.messageTypes.storageData) return;
      onRulesReceived(data.data);
    });
  }

  loadCachedRules();
  window.addEventListener("message", onMessage, true);
  patchFetch();
  patchXhr();

  safeCall(() => {
    window.postMessage({ from: config.fromPage, type: config.messageTypes.ready }, document.location.origin);
  });
})();


