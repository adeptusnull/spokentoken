"use strict";

let page = {
  title: "",
  hostname: "",
  source: "page",
  paragraphs: []
};

let settings = {
  endpoint: "http://127.0.0.1:8880/v1/audio/speech",
  model: "macos",
  voice: "af_heart",
  rate: 1
};

let index = 0;
let audio = null;
let audioUrl = "";
let controller = null;
let playGeneration = 0;

function publish(status, error = "") {
  chrome.runtime.sendMessage({
    target: "service-worker",
    type: "playerState",
    state: {
      status,
      title: page.title,
      hostname: page.hostname,
      source: page.source,
      index,
      total: page.paragraphs.length,
      error
    }
  }).catch(() => {});
}

function releaseAudio() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio = null;
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = "";
  }
}

function cancelCurrent() {
  playGeneration += 1;
  controller?.abort();
  controller = null;
  releaseAudio();
}

function localEndpoint(value) {
  const url = new URL(value);
  return url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

async function playCurrent() {
  const generation = ++playGeneration;
  controller?.abort();
  releaseAudio();

  if (!page.paragraphs.length || index >= page.paragraphs.length) {
    index = Math.max(0, page.paragraphs.length - 1);
    publish("finished");
    return;
  }

  if (!localEndpoint(settings.endpoint)) {
    publish("error", "The speech endpoint must stay on this computer.");
    return;
  }

  publish("loading");
  controller = new AbortController();

  try {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        input: page.paragraphs[index],
        voice: settings.voice,
        response_format: "mp3",
        speed: 1
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      throw new Error(`Local speech service returned ${response.status}${detail ? `: ${detail}` : "."}`);
    }

    const blob = await response.blob();
    if (generation !== playGeneration) return;

    audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.preload = "auto";
    audio.playbackRate = Number(settings.rate) || 1;
    audio.preservesPitch = true;

    audio.addEventListener("play", () => publish("playing"));
    audio.addEventListener("pause", () => {
      if (audio && !audio.ended) publish("paused");
    });
    audio.addEventListener("ended", () => {
      releaseAudio();
      index += 1;
      void playCurrent();
    });
    audio.addEventListener("error", () => {
      publish("error", "The local service returned audio that this browser could not play.");
    });

    await audio.play();
  } catch (error) {
    if (error?.name === "AbortError" || generation !== playGeneration) return;
    const message = error instanceof Error ? error.message : "Could not reach the local speech service.";
    publish(
      "error",
      message.includes("Failed to fetch")
        ? "Kokoro is not reachable at localhost. Start the spoken token service and try again."
        : message
    );
  } finally {
    controller = null;
  }
}

function command(value) {
  switch (value) {
    case "pause":
      audio?.pause();
      break;
    case "resume":
      if (audio) {
        audio.playbackRate = Number(settings.rate) || 1;
        void audio.play();
      } else {
        void playCurrent();
      }
      break;
    case "stop":
      cancelCurrent();
      index = 0;
      publish("idle");
      break;
    case "next":
      cancelCurrent();
      index = Math.min(page.paragraphs.length - 1, index + 1);
      void playCurrent();
      break;
    case "previous":
      cancelCurrent();
      index = Math.max(0, index - 1);
      void playCurrent();
      break;
    default:
      break;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return;

  if (message.type === "startPlayback") {
    cancelCurrent();
    page = message.page;
    settings = { ...settings, ...message.settings };
    index = 0;
    void playCurrent();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "playerCommand") {
    command(message.command);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "settingsChanged") {
    const previousVoice = settings.voice;
    settings = { ...settings, ...message.settings };
    if (audio) audio.playbackRate = Number(settings.rate) || 1;
    if (previousVoice !== settings.voice && page.paragraphs.length) {
      cancelCurrent();
      void playCurrent();
    }
    sendResponse({ ok: true });
  }
});
