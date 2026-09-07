/* ============================================================
   pdf.js — Extraction légère de texte depuis un PDF (hors-ligne).
   API : PDF.text(file) → Promise<string>
   Idéal pour la plupart des « Imprimer en PDF » (Excel, LibreOffice…).
   Suit les positions verticales (Td/TD/Tm) pour reconstituer les
   lignes. Best-effort : PDF scannés ou très exotiques → texte vide.
   ============================================================ */
window.PDF = (function () {
  function readBytes(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }
  function latin1(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  async function inflate(buf) {
    if (typeof DecompressionStream === 'function') {
      try {
        const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (e) {
        try {
          const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (e2) { return null; }
      }
    }
    return null;
  }
  const dec1252 = new TextDecoder('windows-1252');
  function decodeStr(raw) {
    let nul = 0;
    for (let i = 0; i < raw.length; i++) if (raw[i] === 0) nul++;
    if (raw.length > 2 && nul * 2 >= raw.length - 2) {
      try { return new TextDecoder('utf-16be').decode(raw); } catch (e) { /* fallback */ }
    }
    return dec1252.decode(raw);
  }
  function hexDigit(c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
  function isNumCh(c) { return (c >= '0' && c <= '9') || c === '-' || c === '+' || c === '.'; }

  function extractText(content) {
    const s = latin1(content);
    const runs = [];
    let y = null, anyY = false;
    const nums = [];
    let i = 0, n = s.length;
    function pushRun(t) { if (t) runs.push({ t: t, y: y == null ? 0 : y }); }
    while (i < n) {
      const ch = s[i];
      if (ch === '(') {
        let depth = 1, j = i + 1;
        const raw = [];
        while (j < n && depth > 0) {
          const c = s[j];
          if (c === '\\') {
            const nx = s[j + 1];
            if (nx === 'n') { raw.push(10); j += 2; continue; }
            if (nx === 'r') { raw.push(13); j += 2; continue; }
            if (nx === 't') { raw.push(9); j += 2; continue; }
            if (nx === 'b') { raw.push(8); j += 2; continue; }
            if (nx === 'f') { raw.push(12); j += 2; continue; }
            if (nx && nx >= '0' && nx <= '7') {
              const m = s.slice(j + 1, j + 4).match(/^[0-7]{1,3}/);
              raw.push(parseInt(m[0], 8) & 0xFF);
              j += 1 + m[0].length;
              continue;
            }
            if (nx === '(' || nx === ')' || nx === '\\') { raw.push(nx.charCodeAt(0) & 0xFF); j += 2; continue; }
            j += 2; continue;
          }
          if (c === '(') depth++;
          else if (c === ')') { depth--; if (depth === 0) break; }
          raw.push(c.charCodeAt(0) & 0xFF);
          j++;
        }
        i = j + 1;
        pushRun(decodeStr(Uint8Array.from(raw)));
      } else if (ch === '<') {
        let j = i + 1, hex = '';
        while (j < n && s[j] !== '>') { const c = s[j]; if (hexDigit(c)) hex += c; j++; }
        if (j < n) {
          if (hex.length % 2) hex += '0';
          if (hex.length >= 2) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
            pushRun(decodeStr(bytes));
          }
          i = j + 1;
        } else i = j;
      } else if (isNumCh(ch)) {
        let j = i;
        while (j < n && isNumCh(s[j])) j++;
        const tok = s.slice(i, j);
        if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(tok)) nums.push(Number(tok));
        i = j;
      } else if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '*' || ch === "'") {
        let j = i;
        while (j < n && ((s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= 'a' && s[j] <= 'z') || s[j] === '*' || s[j] === "'")) j++;
        const op = s.slice(i, j);
        if (op === 'Td' || op === 'TD') {
          if (nums.length >= 2) { y = nums[nums.length - 1]; anyY = true; nums.length -= 2; }
        } else if (op === 'Tm') {
          if (nums.length >= 6) { y = nums[nums.length - 1]; anyY = true; nums.length = Math.max(0, nums.length - 6); }
        } else if (nums.length > 8) nums.splice(0, nums.length - 8);
        i = j;
      } else i++;
    }
    if (!anyY) return runs.map((r) => r.t);
    runs.sort((a, b) => a.y - b.y);
    const groups = [];
    let cur = null;
    for (const r of runs) {
      if (!cur || Math.abs(r.y - cur.y) > 2) { cur = { y: r.y, texts: [] }; groups.push(cur); }
      cur.texts.push(r.t);
    }
    return groups.map((g) => g.texts.join(' '));
  }

  async function text(file) {
    const data = await readBytes(file);
    const s = latin1(data);
    const streams = [];
    let idx = 0;
    while (true) {
      const st = s.indexOf('stream', idx);
      if (st < 0) break;
      const dictStart = s.lastIndexOf('<<', st);
      const dictPart = s.slice(dictStart, st);
      const isFlate = dictPart.indexOf('FlateDecode') >= 0;
      const end = s.indexOf('endstream', st + 6);
      if (end < 0) break;
      let p = st + 6;
      if (s[p] === '\r') p++;
      if (s[p] === '\n') p++;
      if (isFlate) streams.push(data.slice(p, end));
      idx = end;
    }
    const parts = [];
    for (let k = 0; k < streams.length; k++) {
      const dec = await inflate(streams[k]);
      if (dec) parts.push(extractText(dec).join('\n'));
      else if (parts.length === 0 && k === streams.length - 1) break;
    }
    return parts.join('\n');
  }

  return { text: text };
})();