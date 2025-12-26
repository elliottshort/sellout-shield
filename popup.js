const CONFIG = Object.freeze({
  repoUrl: "https://github.com/elliottshort/sellout-shield"
});

const byId = (id) => document.getElementById(id);

const setText = (id, value) => {
  const el = byId(id);
  if (el) el.textContent = String(value ?? "");
  return el;
};

const setDisabled = (id, value) => {
  const el = byId(id);
  if (el && "disabled" in el) el.disabled = Boolean(value);
  return el;
};

const sendMessage = (message) =>
  new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));

const toLocalTime = (iso) => {
  const date = new Date(String(iso ?? ""));
  return Number.isFinite(date.valueOf()) ? date.toLocaleString() : "";
};

const render = ({ count, updatedAt, error, status }) => {
  setText("count", typeof count === "number" ? String(count) : "—");

  const updated = updatedAt ? `Last updated: ${toLocalTime(updatedAt)}` : "";
  const meta = [updated, error ? `Error: ${error}` : ""].filter(Boolean).join("\n");
  setText("meta", meta);

  setText("status", status ?? "");
};

const refresh = async () => {
  const res = await sendMessage({ type: "selloutshield:getStatus" });
  render({
    count: res?.count ?? 0,
    updatedAt: res?.updatedAt ?? "",
    error: res?.error ?? "",
    status: ""
  });
};

const runUpdate = async () => {
  setDisabled("update", true);
  render({ status: "Checking for updates…" });
  const res = await sendMessage({ type: "selloutshield:updateBlocklist" });
  const label = res?.updated ? "Updated block list." : "Block list is up to date.";
  render({
    count: res?.count ?? 0,
    updatedAt: res?.updatedAt ?? "",
    error: res?.error ?? "",
    status: label
  });
  setDisabled("update", false);
};

const wire = () => {
  const link = byId("contribute");
  if (link) link.href = CONFIG.repoUrl;

  const button = byId("update");
  if (button) button.addEventListener("click", runUpdate);

  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== "local") return;
    refresh();
  });
};

wire();
refresh();


