"use strict";

const DEFAULTS = {
  endpoint: "http://127.0.0.1:8880/v1/audio/speech",
  model: "macos",
  voice: "af_heart",
  rate: 1,
  maxLength: 700
};

const form = document.querySelector("#settings-form");
const endpoint = document.querySelector("#endpoint");
const model = document.querySelector("#model");
const maxLength = document.querySelector("#max-length");
const testButton = document.querySelector("#test");
const status = document.querySelector("#status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function parseLocalEndpoint(value) {
  const url = new URL(value);
  const isLocal = url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!isLocal) {
    throw new Error("Use an http://localhost or http://127.0.0.1 address.");
  }
  return url.toString();
}

async function currentSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

async function load() {
  const settings = await currentSettings();
  endpoint.value = settings.endpoint;
  model.value = settings.model;
  maxLength.value = String(settings.maxLength);
}

async function values() {
  const previous = await currentSettings();
  return {
    ...previous,
    endpoint: parseLocalEndpoint(endpoint.value),
    model: model.value.trim() || "macos",
    maxLength: Number(maxLength.value)
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const settings = await values();
    await chrome.storage.local.set({ settings });
    setStatus("Saved. Your speech connection remains local.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Settings could not be saved.", true);
  }
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  setStatus("Asking the local model to speak…");

  try {
    const settings = await values();
    const response = await fetch(settings.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        input: "Spoken Token is connected and ready to read.",
        voice: settings.voice,
        response_format: "mp3",
        speed: 1
      })
    });

    if (!response.ok) throw new Error(`The local service returned ${response.status}.`);
    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
    await audio.play();
    setStatus("Connected. The test phrase is playing.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The spoken token could not be reached.";
    setStatus(
      detail.includes("Failed to fetch")
        ? "Kokoro is not reachable. Start the spoken token service and try again."
        : detail,
      true
    );
  } finally {
    testButton.disabled = false;
  }
});

load().catch(() => setStatus("Settings could not be loaded.", true));
