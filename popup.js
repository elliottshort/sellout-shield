const config = Object.freeze({
  repoUrl: "https://github.com/elliottshort/sellout-shield",
  messageTypes: Object.freeze({
    getStatus: "selloutshield:getStatus",
    updateBlocklist: "selloutshield:updateBlocklist"
  })
});

const $ = (id) => document.getElementById(id);

const setText = (id, value) => {
  const el = $(id);
  if (el) el.textContent = String(value ?? "");
};

const setDisabled = (id, disabled) => {
  const el = $(id);
  if (el && "disabled" in el) el.disabled = Boolean(disabled);
};

const sendMessage = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));

const formatLocalTime = (iso) => {
  const date = new Date(String(iso ?? ""));
  return Number.isFinite(date.valueOf()) ? date.toLocaleString() : "";
};

const renderStatus = ({ count, updatedAt, error, statusText }) => {
  setText("count", typeof count === "number" ? String(count) : "—");

  const updatedLine = updatedAt ? `Last updated: ${formatLocalTime(updatedAt)}` : "";
  const errorLine = error ? `Error: ${error}` : "";
  setText("meta", [updatedLine, errorLine].filter(Boolean).join("\n"));

  setText("status", statusText ?? "");
};

const refresh = async () => {
  const res = await sendMessage({ type: config.messageTypes.getStatus });
  renderStatus({
    count: res?.count ?? 0,
    updatedAt: res?.updatedAt ?? "",
    error: res?.error ?? "",
    statusText: ""
  });
};

const updateBlocklist = async () => {
  setDisabled("update", true);
  renderStatus({ statusText: "Checking for updates…" });

  const res = await sendMessage({ type: config.messageTypes.updateBlocklist });
  renderStatus({
    count: res?.count ?? 0,
    updatedAt: res?.updatedAt ?? "",
    error: res?.error ?? "",
    statusText: res?.updated ? "Updated block list." : "Block list is up to date."
  });

  setDisabled("update", false);
};

const wireUi = () => {
  const link = $("contribute");
  if (link) link.href = config.repoUrl;

  const button = $("update");
  if (button) button.addEventListener("click", updateBlocklist);

  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== "local") return;
    refresh();
  });
};

wireUi();
refresh();


