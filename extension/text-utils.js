(function attachTextUtils(scope) {
  "use strict";

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00ad/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, " ")
      .trim();
  }

  function splitLongPiece(piece, maxLength) {
    const sentences = piece.match(/[^.!?。！？]+[.!?。！？]+(?:["'’”)]*)|[^.!?。！？]+$/g) || [piece];
    const chunks = [];
    let current = "";

    for (const sentenceValue of sentences) {
      const sentence = normalizeText(sentenceValue);
      if (!sentence) continue;

      if (sentence.length > maxLength) {
        if (current) {
          chunks.push(current);
          current = "";
        }

        const words = sentence.split(" ");
        let wordChunk = "";
        for (const word of words) {
          const candidate = normalizeText(`${wordChunk} ${word}`);
          if (candidate.length > maxLength && wordChunk) {
            chunks.push(wordChunk);
            wordChunk = word;
          } else {
            wordChunk = candidate;
          }
        }
        if (wordChunk) chunks.push(wordChunk);
        continue;
      }

      const candidate = normalizeText(`${current} ${sentence}`);
      if (candidate.length > maxLength && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  function chunkText(pieces, maxLength = 700) {
    const safeLimit = Math.min(1200, Math.max(200, Number(maxLength) || 700));
    const chunks = [];

    for (const rawPiece of pieces || []) {
      const piece = normalizeText(rawPiece);
      if (piece.length < 2) continue;
      chunks.push(...splitLongPiece(piece, safeLimit));
    }

    return chunks.slice(0, 500);
  }

  scope.SpokenTokenText = Object.freeze({
    normalizeText,
    chunkText
  });
})(globalThis);
