(function registerSpokenTokenReader() {
  "use strict";

  if (globalThis.__spokenTokenReaderRegistered) return;
  globalThis.__spokenTokenReaderRegistered = true;

  const EXCLUDED_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "video",
    "audio",
    "nav",
    "footer",
    "aside",
    "form",
    "button",
    "input",
    "textarea",
    "select",
    "dialog",
    "[aria-modal='true']",
    "[aria-hidden='true']",
    "[hidden]"
  ].join(",");

  const TEXT_SELECTOR = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "li",
    "blockquote",
    "pre",
    "figcaption",
    "dt",
    "dd"
  ].join(",");

  function rootCandidates() {
    return [
      document.querySelector("article"),
      document.querySelector("main"),
      document.querySelector("[role='main']"),
      document.querySelector(".post-content"),
      document.querySelector(".entry-content"),
      document.querySelector(".article-body"),
      document.body
    ].filter(Boolean);
  }

  function candidateScore(element) {
    const textLength = SpokenTokenText.normalizeText(element.innerText).length;
    const paragraphCount = element.querySelectorAll("p").length;
    const linkTextLength = [...element.querySelectorAll("a")]
      .reduce((total, link) => total + SpokenTokenText.normalizeText(link.innerText).length, 0);
    return textLength + paragraphCount * 180 - linkTextLength * 0.55;
  }

  function chooseRoot() {
    const candidates = rootCandidates();
    return candidates.sort((left, right) => candidateScore(right) - candidateScore(left))[0] || document.body;
  }

  function isReadable(element) {
    const style = getComputedStyle(element);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0;
  }

  function collectPieces(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(EXCLUDED_SELECTOR).forEach((node) => node.remove());

    const pieces = [];
    const seen = new Set();

    for (const node of clone.querySelectorAll(TEXT_SELECTOR)) {
      const text = SpokenTokenText.normalizeText(node.innerText || node.textContent);
      if (text.length < 2 || seen.has(text)) continue;
      seen.add(text);
      pieces.push(text);
    }

    if (!pieces.length) {
      const fallback = SpokenTokenText.normalizeText(clone.innerText || clone.textContent);
      if (fallback) pieces.push(fallback);
    }

    return pieces;
  }

  function selectionPieces() {
    const selection = globalThis.getSelection?.();
    const text = SpokenTokenText.normalizeText(selection?.toString());
    return text.length >= 20 ? [text] : [];
  }

  function extractReadablePage(maxLength) {
    const selected = selectionPieces();
    const root = chooseRoot();
    const pieces = selected.length ? selected : collectPieces(root).filter((piece, index) => {
      if (index < 3) return true;
      return piece.length >= 18;
    });

    const paragraphs = SpokenTokenText.chunkText(pieces, maxLength);
    const hostname = location.hostname.replace(/^www\./, "") || "this page";

    return {
      title: SpokenTokenText.normalizeText(document.title) || hostname,
      hostname,
      url: location.href,
      source: selected.length ? "selection" : "page",
      paragraphs
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "extractReadablePage") return;

    try {
      sendResponse({
        ok: true,
        page: extractReadablePage(message.maxLength)
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "This page could not be read."
      });
    }
  });

  void isReadable;
})();
