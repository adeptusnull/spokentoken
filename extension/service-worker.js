"use strict";

const OFFSCREEN_PATH = "offscreen.html";
const DEFAULT_SETTINGS = Object.freeze({
  endpoint: "http://127.0.0.1:8880/v1/audio/speech",
  model: "macos",
  voice: "af_heart",
  rate: 1,
  maxLength: 700
});

const IDLE_STATE = Object.freeze({
  status: "idle",
  title: "",
  hostname: "",
  source: "page",
  index: 0,
  total: 0,
  error: ""
});

let creatingOffscreenDocument = null;

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function getState() {
  const stored = await chrome.storage.session.get("playerState");
  return { ...IDLE_STATE, ...(stored.playerState || {}) };
}

async function setState(nextState) {
  const state = { ...IDLE_STATE, ...nextState };
  await chrome.storage.session.set({ playerState: state });
  chrome.runtime.sendMessage({
    target: "popup",
    type: "stateChanged",
    state
  }).catch(() => {});
  return state;
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (existing.length) return;
  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["AUDIO_PLAYBACK", "BLOBS"],
    justification: "Generate and play speech returned by the local text-to-speech model."
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Open a webpage, then try Spoken Token again.");
  if (!/^https?:/i.test(tab.url || "")) {
    throw new Error("This browser page does not allow extensions to read its text.");
  }
  return tab;
}

async function requestExtraction(maxLength) {
  const tab = await activeTab();

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "extractReadablePage",
      maxLength
    });
    if (response?.ok) return response.page;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["text-utils.js", "content-script.js"]
    });
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "extractReadablePage",
    maxLength
  });

  if (!response?.ok) throw new Error(response?.error || "No readable text was found.");
  return response.page;
}

async function inspectPage() {
  const settings = await getSettings();
  const page = await requestExtraction(settings.maxLength);
  const current = await getState();
  const state = {
    ...current,
    title: page.title,
    hostname: page.hostname,
    source: page.source,
    total: page.paragraphs.length,
    error: page.paragraphs.length ? "" : "No readable text was found on this page."
  };
  await setState(state);
  return state;
}

async function startReading() {
  const settings = await getSettings();
  const page = await requestExtraction(settings.maxLength);

  if (!page.paragraphs.length) {
    throw new Error("No readable text was found on this page.");
  }

  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "startPlayback",
    page,
    settings
  });
}

async function playerCommand(command) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "playerCommand",
    command
  });
}

async function updateQuickSetting(key, value) {
  const settings = await getSettings();
  const nextSettings = { ...settings, [key]: value };
  await chrome.storage.local.set({ settings: nextSettings });

  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "settingsChanged",
    settings: nextSettings
  });
  return nextSettings;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await setState(IDLE_STATE);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target === "offscreen" || message.target === "popup") return;

  const handle = async () => {
    switch (message.type) {
      case "getState":
        return { ok: true, state: await getState(), settings: await getSettings() };
      case "inspectPage":
        return { ok: true, state: await inspectPage() };
      case "startReading":
        await startReading();
        return { ok: true };
      case "playerCommand":
        await playerCommand(message.command);
        return { ok: true };
      case "updateQuickSetting":
        return {
          ok: true,
          settings: await updateQuickSetting(message.key, message.value)
        };
      case "playerState":
        return { ok: true, state: await setState(message.state) };
      default:
        return { ok: false, error: "Unknown Spoken Token message." };
    }
  };

  handle()
    .then(sendResponse)
    .catch(async (error) => {
      const messageText = error instanceof Error ? error.message : "Spoken Token could not complete that action.";
      if (message.type !== "getState") {
        const current = await getState();
        await setState({ ...current, status: "error", error: messageText });
      }
      sendResponse({ ok: false, error: messageText });
    });

  return true;
});
