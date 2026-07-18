"use strict";

const elements = {
  title: document.querySelector("#page-title"),
  host: document.querySelector("#page-host"),
  notice: document.querySelector("#notice"),
  previous: document.querySelector("#previous"),
  play: document.querySelector("#play"),
  next: document.querySelector("#next"),
  playIcon: document.querySelector("#play-icon"),
  pauseIcon: document.querySelector("#pause-icon"),
  spinner: document.querySelector("#spinner"),
  progressFill: document.querySelector("#progress-fill"),
  progressLabel: document.querySelector("#progress-label"),
  speed: document.querySelector("#speed"),
  speedValue: document.querySelector("#speed-value"),
  speedDown: document.querySelector("#speed-down"),
  speedUp: document.querySelector("#speed-up"),
  voice: document.querySelector("#voice"),
  settings: document.querySelector("#settings"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label")
};

const hasExtensionApi = Boolean(globalThis.chrome?.runtime?.sendMessage);

let state = {
  status: "idle",
  title: "",
  hostname: "",
  source: "page",
  index: 0,
  total: 0,
  error: ""
};

let engineLabel = "Kokoro";

function labelForState() {
  if (state.status === "finished") return "Finished";
  if (!state.total) return "Ready to read";
  const noun = state.source === "selection" ? "Section" : "Paragraph";
  return `${noun} ${Math.min(state.index + 1, state.total)} of ${state.total}`;
}

function render() {
  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";
  const hasContent = state.total > 0;
  const progress = hasContent ? ((state.index + 1) / state.total) * 100 : 0;

  elements.title.textContent = state.title || "Open a webpage to begin";
  elements.host.textContent = state.hostname || "Local, private reading";
  elements.notice.hidden = !state.error;
  elements.notice.textContent = state.error || "";
  elements.progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  elements.progressLabel.textContent = labelForState();

  elements.playIcon.hidden = isPlaying || isLoading;
  elements.pauseIcon.hidden = !isPlaying;
  elements.spinner.hidden = !isLoading;
  elements.play.ariaLabel = isPlaying ? "Pause reading" : "Read this page";
  elements.previous.disabled = !hasContent || state.index <= 0 || isLoading;
  elements.next.disabled = !hasContent || state.index >= state.total - 1 || isLoading;

  elements.connectionDot.className = "status-dot";
  if (state.status === "error") {
    elements.connectionDot.classList.add("error");
    elements.connectionLabel.textContent = `${engineLabel} needs attention`;
  } else if (isLoading) {
    elements.connectionDot.classList.add("busy");
    elements.connectionLabel.textContent = `${engineLabel} is speaking locally`;
  } else {
    elements.connectionDot.classList.add("green");
    elements.connectionLabel.textContent = `${engineLabel} connected · localhost`;
  }
}

async function send(message) {
  if (!hasExtensionApi) return { ok: true };
  return chrome.runtime.sendMessage(message);
}

async function refreshInitialState() {
  if (!hasExtensionApi) {
    state = {
      ...state,
      title: "The quiet architecture of attention",
      hostname: "example.com",
      index: 3,
      total: 18
    };
    render();
    return;
  }

  const response = await send({ target: "service-worker", type: "getState" });
  if (response?.ok) {
    state = response.state;
    engineLabel = response.settings.model === "macos" ? "Mac voice" : "Kokoro";
    elements.speed.value = response.settings.rate;
    elements.speedValue.value = `${Number(response.settings.rate).toFixed(1)}×`;
    elements.voice.value = response.settings.voice;
    render();
  }

  if (!state.title || state.status === "idle") {
    const inspection = await send({ target: "service-worker", type: "inspectPage" });
    if (inspection?.ok) {
      state = inspection.state;
    } else {
      state = { ...state, status: "error", error: inspection?.error || "This page could not be read." };
    }
    render();
  }
}

elements.play.addEventListener("click", async () => {
  if (!hasExtensionApi) {
    state = {
      ...state,
      status: state.status === "playing" ? "paused" : "playing"
    };
    render();
    return;
  }

  if (state.status === "playing") {
    await send({ target: "service-worker", type: "playerCommand", command: "pause" });
  } else if (state.status === "paused") {
    await send({ target: "service-worker", type: "playerCommand", command: "resume" });
  } else {
    state = { ...state, status: "loading", error: "" };
    render();
    const response = await send({ target: "service-worker", type: "startReading" });
    if (!response?.ok) {
      state = { ...state, status: "error", error: response?.error || "Reading could not start." };
      render();
    }
  }
});

elements.previous.addEventListener("click", () => {
  if (!hasExtensionApi) {
    state = { ...state, index: Math.max(0, state.index - 1) };
    render();
    return;
  }
  void send({ target: "service-worker", type: "playerCommand", command: "previous" });
});

elements.next.addEventListener("click", () => {
  if (!hasExtensionApi) {
    state = { ...state, index: Math.min(state.total - 1, state.index + 1) };
    render();
    return;
  }
  void send({ target: "service-worker", type: "playerCommand", command: "next" });
});

elements.speed.addEventListener("input", () => {
  const rate = Number(elements.speed.value);
  elements.speedValue.value = `${rate.toFixed(1)}×`;
});

elements.speed.addEventListener("change", () => {
  void send({
    target: "service-worker",
    type: "updateQuickSetting",
    key: "rate",
    value: Number(elements.speed.value)
  });
});

function stepSpeed(delta) {
  const minimum = Number(elements.speed.min);
  const maximum = Number(elements.speed.max);
  const next = Math.min(maximum, Math.max(minimum, Number(elements.speed.value) + delta));
  elements.speed.value = next.toFixed(1);
  elements.speed.dispatchEvent(new Event("input", { bubbles: true }));
  elements.speed.dispatchEvent(new Event("change", { bubbles: true }));
}

elements.speedDown.addEventListener("click", () => stepSpeed(-0.1));
elements.speedUp.addEventListener("click", () => stepSpeed(0.1));

elements.voice.addEventListener("change", () => {
  void send({
    target: "service-worker",
    type: "updateQuickSetting",
    key: "voice",
    value: elements.voice.value
  });
});

elements.settings.addEventListener("click", () => {
  if (hasExtensionApi) chrome.runtime.openOptionsPage();
});

if (hasExtensionApi) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.target !== "popup" || message.type !== "stateChanged") return;
    state = message.state;
    render();
  });
}

refreshInitialState().catch((error) => {
  state = {
    ...state,
    status: "error",
    error: error instanceof Error ? error.message : "Spoken Token could not open."
  };
  render();
});
