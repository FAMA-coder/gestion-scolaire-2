/* ============================================================
   excel.js — Lecture de feuilles de calcul hors-ligne.
   Convertit un fichier CSV, HTML exporté (.xls), XLSX (ZIP+XML)
   ou .xls binaire (BIFF8) en une grille [[cellule]].
   API : Excel.parse(file) → Promise<Array<Array<string>>>
   ============================================================ */
window.Excel = (function () {
  function decode(buf) {
    try { return new TextDecoder('utf-8').decode(buf); }
    catch (e) {
      let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      return s;
    }
  }
  function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
  function readBytes(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }
  function parseDelimited(text) {
    const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) return [];
    return lines.map((line) => {
      const out = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
        else if (ch === '"') inQ = true;
        else if (ch === ';' || ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    });
  }
  function xmlElText(el) {
    if (!el) return '';
    const ts = el.getElementsByTagName('t');
    if (!ts.length) return '';
    let s = '';
    for (let i = 0; i < ts.length; i++) s += ts[i].textContent || '';
    return s;
  }
  function colRefToIndex(ref) {
    let c = 0;
    for (let i = 0; i < ref.length; i++) {
      const ch = ref.charCodeAt(i);
      if (ch >= 65 && ch <= 90) c = c * 26 + (ch - 64);
      else break;
    }
    return c - 1;
  }

  var sharedStrings = [];
  function parseXlsxXml(xml) {
    const grid = [];
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const rows = doc.getElementsByTagName('row');
    for (let r = 0; r < rows.length; r++) {
      const rowEl = rows[r];
      const cells = rowEl.getElementsByTagName('c');
      let rowArr = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const type = c.getAttribute('t') || '';
        const ref = c.getAttribute('r') || '';
        let v = '';
        if (type === 's') {
          const vEl = c.getElementsByTagName('v')[0];
          const idx = vEl ? Number(vEl.textContent) : -1;
          v = (idx >= 0 && sharedStrings[idx] != null) ? sharedStrings[idx] : '';
        } else if (type === 'inlineStr') {
          const is = c.getElementsByTagName('is')[0];
          v = is ? xmlElText(is) : '';
        } else if (type === 'str' || type === 'b' || type === 'e' || type === '') {
          const vEl = c.getElementsByTagName('v')[0];
          v = vEl ? (vEl.textContent || '') : '';
        }
        const ci = ref ? colRefToIndex(ref) : -1;
        if (ci >= 0) { while (rowArr.length <= ci) rowArr.push(''); rowArr[ci] = v; }
        else rowArr.push(v);
      }
      if (rowArr.some((x) => x !== '')) grid.push(rowArr);
    }
    return grid;
  }
  async function inflateDecomp(data) {
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream non disponible');
    const stream = new Blob([data.buffer instanceof ArrayBuffer ? data.buffer : new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function parseZip(buf) {
    const out = {};
    const u16 = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    const from = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= from; i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP invalide (pas de fin)');
    const count = u16.getUint16(eocd + 10, true);
    let cd = u16.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
      if (u8[cd] !== 0x50 || u8[cd + 1] !== 0x4b || u8[cd + 2] !== 0x01 || u8[cd + 3] !== 0x02) break;
      const method = u16.getUint16(cd + 10, true);
      const csize = u16.getUint32(cd + 20, true);
      const usize = u16.getUint32(cd + 24, true);
      const nameLen = u16.getUint16(cd + 28, true);
      const extraLen = u16.getUint16(cd + 30, true);
      const cmtLen = u16.getUint16(cd + 32, true);
      const localOff = u16.getUint32(cd + 42, true);
      let name = '';
      for (let k = 0; k < nameLen; k++) name += String.fromCharCode(u8[cd + 46 + k]);
      const dStart = localOff + 30 + u16.getUint16(localOff + 26, true) + u16.getUint16(localOff + 28, true);
      const raw = u8.slice(dStart, dStart + csize);
      if (method === 0) out[name] = raw;
      else if (method === 8) out[name] = raw;
      else out[name] = null;
      cd += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }
  async function parseXlsx(buf) {
    const zip = parseZip(buf);
    sharedStrings = [];
    const sstEntry = zip['xl/sharedStrings.xml'];
    if (sstEntry) {
      let sstXml;
      try { sstXml = decode(await inflateDecomp(sstEntry)); }
      catch (e) { sstXml = decode(sstEntry); }
      const doc = new DOMParser().parseFromString(sstXml, 'text/xml');
      const sis = doc.getElementsByTagName('si');
      for (let i = 0; i < sis.length; i++) sharedStrings.push(xmlElText(sis[i]));
    }
    let sheetName = null;
    if (zip['xl/worksheets/sheet1.xml']) sheetName = 'xl/worksheets/sheet1.xml';
    else {
      for (const k in zip) if (k.indexOf('xl/worksheets/sheet') === 0 && k.slice(-4) === '.xml') { sheetName = k; break; }
    }
    if (!sheetName) throw new Error('Aucune feuille de calcul trouvée');
    let sheetXml;
    try { sheetXml = decode(await inflateDecomp(zip[sheetName])); }
    catch (e) { sheetXml = decode(zip[sheetName]); }
    return parseXlsxXml(sheetXml);
  }
  function parseHtmlTable(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const table = doc.querySelector('table');
    if (!table) throw new Error('Aucun tableau trouvé dans le fichier.');
    const grid = [];
    for (const tr of table.querySelectorAll('tr')) {
      const row = [];
      for (const cell of tr.querySelectorAll('th,td')) row.push((cell.textContent || '').trim());
      if (row.some((c) => c !== '')) grid.push(row);
    }
    return grid;
  }
  // ---- .xls binaire (BIFF8) minimal ----
  function biffReadStrings(chunks) {
    const strings = [];
    if (!chunks.length) return strings;
    let gi = 0, gp = 8;
    function byte() {
      while (gi < chunks.length && gp >= chunks[gi].length) { gi++; gp = 0; }
      if (gi >= chunks.length) throw new Error('SST tronquée');
      return chunks[gi][gp++];
    }
    function readChar(high) {
      return high ? String.fromCharCode((byte() | (byte() << 8)) & 0xFFFF) : String.fromCharCode(byte());
    }
    function rdString() {
      const cch = byte() | (byte() << 8);
      if (cch <= 0) return '';
      const grbit = byte();
      const fHigh = (grbit & 0x01) !== 0;
      const fRich = (grbit & 0x08) !== 0;
      const fPhon = (grbit & 0x10) !== 0;
      let nRun = 0;
      if (fRich) { nRun = byte() | (byte() << 8); }
      let s = '';
      for (let i = 0; i < cch; i++) s += readChar(fHigh);
      if (fRich) for (let i = 0; i < nRun; i++) { byte(); byte(); byte(); byte(); }
      if (fPhon) { const cb = (byte() | (byte() << 16) | (byte() << 24) | (byte() << 32)) >>> 0; for (let i = 0; i < cb; i++) byte(); }
      return s;
    }
    try { while (true) strings.push(rdString()); } catch (e) { }
    return strings;
  }
  function decodeRK(rk) {
    const type = rk & 3;
    if (type === 0 || type === 1) {
      const hi = (rk & 0xFFFFFFFC) >>> 0;
      const fbuf = new ArrayBuffer(8);
      const fdv = new DataView(fbuf);
      fdv.setUint32(0, hi, false);
      fdv.setUint32(4, 0, false);
      let d = fdv.getFloat64(0, false);
      if (type === 1) d /= 100;
      return d;
    } else {
      const iv = (rk >> 2);
      return type === 3 ? iv / 100 : iv;
    }
  }
  function fmtNumber(n) {
    if (typeof n === 'number') {
      if (Number.isInteger(n)) return String(n);
      const round = Math.round(n * 100) / 100;
      if (Math.abs(n - round) < 1e-9) return String(round);
      return String(n);
    }
    return String(n);
  }
  function parseXlsBiff(buf) {
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const sectorShift = dv.getUint16(30, true);
    const sec = 1 << sectorShift;
    const dirStart = dv.getUint32(48, true);
    const miniShift = dv.getUint16(32, true);
    const miniCutoff = dv.getUint32(56, true);
    const fatSectors = [];
    for (let i = 0; i < 109; i++) {
      const s = dv.getUint32(76 + i * 4, true);
      if (s === 0xFFFFFFFE || s === 0xFFFFFFFF) break;
      fatSectors.push(s);
    }
    const fat = new Uint32Array(Math.ceil((u8.length / sec)) + 4);
    const secOff = (n) => 512 + n * sec;
    function readFATSectors() {
      const n = fatSectors.length;
      const perSect = sec / 4;
      for (let si = 0; si < n; si++) {
        const base = secOff(fatSectors[si]);
        for (let i = 0; i < perSect; i++) fat[si * perSect + i] = dv.getUint32(base + i * 4, true);
      }
    }
    readFATSectors();
    function readStream(startSector, size) {
      const out = new Uint8Array(size);
      let pos = 0, s = startSector;
      while (s !== 0xFFFFFFFE && s !== 0xFFFFFFFF && pos < size) {
        const base = secOff(s);
        const seg = Math.min(sec, size - pos);
        out.set(u8.slice(base, base + seg), pos);
        pos += seg;
        s = fat[s];
      }
      return out.slice(0, pos);
    }
    const dirBytes = readStream(dirStart, sec * 4 * 4);
    const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    let workStart = -1, workSize = 0;
    for (let e = 0; e * 128 + 128 <= dirBytes.length; e++) {
      const o = e * 128;
      const type = ddv.getUint8(o + 66);
      let name = '';
      const nameLen = ddv.getUint16(o + 64, true);
      for (let i = 0; i + 1 < nameLen - 2 && i + 1 < 64; i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
      const start = ddv.getUint32(o + 116, true);
      const size = ddv.getUint32(o + 120, true) + ddv.getUint32(o + 124, true) * 4294967296;
      if (type === 2 && (name === 'Workbook' || name === 'Book')) { workStart = start; workSize = size; }
    }
    if (workStart < 0) throw new Error('Flux Workbook introuvable');
    const wb = readStream(workStart, workSize);
    const wdv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const w8 = new Uint8Array(wb.buffer, wb.byteOffset, wb.byteLength);
    const grid = [];
    let sstStrings = [];
    const records = [];
    let pos = 0;
    while (pos + 4 <= wb.length) {
      const id = wdv.getUint16(pos, true);
      const len = wdv.getUint16(pos + 2, true);
      records.push({ id, len, off: pos + 4 });
      pos += 4 + len;
    }
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.id === 0x00FC) {
        const cont = [w8.slice(r.off, r.off + r.len)];
        let j = i + 1;
        while (j < records.length && records[j].id === 0x003C) { cont.push(w8.slice(records[j].off, records[j].off + records[j].len)); j++; }
        sstStrings = biffReadStrings(cont);
        break;
      }
    }
    function setCell(row, col, val) {
      if (row >= grid.length) while (grid.length <= row) grid.push([]);
      grid[row][col] = val;
    }
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.off + r.len > wb.length) continue;
      const o = r.off;
      if (r.id === 0x00FD) {
        const row = wdv.getUint16(o, true);
        const col = wdv.getUint16(o + 2, true);
        const isst = wdv.getUint32(o + 6, true);
        setCell(row, col, sstStrings[isst] != null ? sstStrings[isst] : '');
      } else if (r.id === 0x0204) {
        const row = wdv.getUint16(o, true);
        const col = wdv.getUint16(o + 2, true);
        let p = o + 6;
        const cch = wdv.getUint16(p, true); p += 2;
        const grbit = w8[p]; p += 1;
        const fHigh = (grbit & 0x01) !== 0;
        let s = '';
        for (let k = 0; k < cch; k++) { if (fHigh) { s += String.fromCharCode(wdv.getUint16(p, true)); p += 2; } else { s += String.fromCharCode(w8[p]); p += 1; } }
        setCell(row, col, s);
      } else if (r.id === 0x027E) {
        const row = wdv.getUint16(o, true);
        const col = wdv.getUint16(o + 2, true);
        const rk = wdv.getUint32(o + 6, true);
        setCell(row, col, fmtNumber(decodeRK(rk)));
      } else if (r.id === 0x00BD) {
        const row = wdv.getUint16(o, true);
        let col = wdv.getUint16(o + 2, true);
        let p = o + 4;
        while (p + 6 <= o + r.len - 2) {
          const rk = wdv.getUint32(p + 2, true);
          setCell(row, col, fmtNumber(decodeRK(rk)));
          p += 6; col++;
        }
      } else if (r.id === 0x0203) {
        const row = wdv.getUint16(o, true);
        const col = wdv.getUint16(o + 2, true);
        const d = wdv.getFloat64(o + 6, true);
        setCell(row, col, String(d));
      }
    }
    return grid.filter((r) => r.some((c) => c !== ''));
  }

  async function spreadsheetToGrid(buf) {
    const len = buf.length;
    let kind;
    if (len >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) kind = 'xlsx';
    else if (len >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) kind = 'xlsbiff';
    else kind = 'text';
    if (kind === 'xlsx') return await parseXlsx(buf);
    if (kind === 'xlsbiff') return parseXlsBiff(buf);
    const text = decode(buf);
    const test = text.replace(/^\uFEFF/, '').trim().slice(0, 200).toLowerCase();
    if (test.indexOf('<table') >= 0 || test.indexOf('<html') >= 0 || test.indexOf('<!doctype') >= 0 || test.indexOf('<tr') >= 0) {
      return parseHtmlTable(text);
    }
    return parseDelimited(text);
  }

  async function parse(file) {
    const bytes = await readBytes(file);
    return spreadsheetToGrid(bytes);
  }

  return { parse: parse };
})();
