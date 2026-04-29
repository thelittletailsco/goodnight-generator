/* Little Tails Co. — Goodnight Book Generator
   PDF generation engine using pdf-lib. All PDF coordinates use points (72/inch).
   Page size: 576 × 576 (8" × 8" trim). No bleed in v1 — add later via padding if Gelato requires.
*/

// ---------- Constants ----------
const PAGE = 576;
const NAVY   = { r: 0x3D/255, g: 0x55/255, b: 0x6E/255 };
const CREAM  = { r: 0xFA/255, g: 0xF3/255, b: 0xD6/255 };
const YELLOW = { r: 0xF5/255, g: 0xC8/255, b: 0x4B/255 };
const WHITE  = { r: 1, g: 1, b: 1 };

// ---------- State ----------
let CONFIG = null;
let MODE = 'library';
let SELECTED_CHAR = null;
let CUSTOM_FILES = {}; // { sceneKey: dataURL }

// ---------- Boot ----------
async function init() {
  const res = await fetch('config.json');
  CONFIG = await res.json();
  buildCharGrid();
  buildUploadGrid();
  attachEventListeners();
  renderOrderLog();
}

function attachEventListeners() {
  document.getElementById('mode-library').onclick = () => setMode('library');
  document.getElementById('mode-custom').onclick  = () => setMode('custom');
  document.getElementById('lib-generate').onclick    = generateLibrary;
  document.getElementById('custom-generate').onclick = generateCustom;
  document.getElementById('clear-log').onclick = clearLog;
}

function setMode(mode) {
  MODE = mode;
  document.getElementById('mode-library').classList.toggle('active', mode === 'library');
  document.getElementById('mode-custom').classList.toggle('active',  mode === 'custom');
  document.getElementById('panel-library').classList.toggle('hidden', mode !== 'library');
  document.getElementById('panel-custom').classList.toggle('hidden',  mode !== 'custom');
}

// ---------- UI builders ----------
function buildCharGrid() {
  const grid = document.getElementById('char-grid');
  grid.innerHTML = '';
  CONFIG.characters.forEach(char => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.dataset.charId = char.id;
    card.innerHTML = `
      <img src="assets/characters/${char.id}/cover.jpg" alt="${char.label}" loading="lazy" />
      <div class="label">${char.label}</div>`;
    card.onclick = () => selectChar(char.id);
    grid.appendChild(card);
  });
}

function selectChar(id) {
  SELECTED_CHAR = id;
  document.querySelectorAll('.char-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.charId === id);
  });
}

function buildUploadGrid() {
  const grid = document.getElementById('upload-grid');
  grid.innerHTML = '';
  CONFIG.scenes.forEach(scene => {
    const slot = document.createElement('div');
    slot.className = 'upload-slot';
    slot.dataset.sceneKey = scene.key;
    slot.innerHTML = `
      <input type="file" accept="image/jpeg,image/png" data-scene="${scene.key}" />
      <div class="scene-label">${scene.label}</div>
      <div class="file-status">Drop image</div>`;
    grid.appendChild(slot);
    slot.querySelector('input').onchange = (e) => handleFileUpload(e.target);
  });
}

function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const sceneKey = input.dataset.scene;
  const reader = new FileReader();
  reader.onload = (e) => {
    CUSTOM_FILES[sceneKey] = e.target.result;
    const slot = input.closest('.upload-slot');
    slot.classList.add('has-file');
    let img = slot.querySelector('img.preview');
    if (!img) {
      img = document.createElement('img');
      img.className = 'preview';
      slot.insertBefore(img, slot.querySelector('.scene-label'));
    }
    img.src = e.target.result;
    slot.querySelector('.file-status').textContent = '✓ loaded';
  };
  reader.readAsDataURL(file);
}

// ---------- Generate handlers ----------
async function generateLibrary() {
  const name = document.getElementById('lib-name').value.trim();
  const status = document.getElementById('lib-status');
  if (!SELECTED_CHAR) return setStatus(status, 'Pick a character first.', 'error');
  if (!name)          return setStatus(status, 'Enter the child\'s name.', 'error');

  setStatus(status, 'Building book…', '');
  try {
    const imageGetter = async (path) => {
      const [scope, key] = path.split('/');
      let url;
      if (scope === 'char') url = `assets/characters/${SELECTED_CHAR}/${key}.jpg`;
      else if (scope === 'bg') url = `assets/backgrounds/${key}.jpg`;
      else throw new Error('Unknown scope: ' + scope);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Image not found: ${url}`);
      return await res.arrayBuffer();
    };

    const pdfBytes = await buildBook(name, imageGetter);
    const filename = `Goodnight_${sanitize(name)}_${SELECTED_CHAR}.pdf`;
    downloadBlob(pdfBytes, filename);
    setStatus(status, `✓ ${filename} downloaded`, 'success');
    logOrder({ mode:'library', character:SELECTED_CHAR, name, filename, ts:Date.now() });
  } catch (err) {
    console.error(err);
    setStatus(status, 'Error: ' + err.message, 'error');
  }
}

async function generateCustom() {
  const name = document.getElementById('custom-name').value.trim();
  const status = document.getElementById('custom-status');
  if (!name) return setStatus(status, 'Enter the child\'s name.', 'error');
  const missing = CONFIG.scenes.filter(s => !CUSTOM_FILES[s.key]).map(s => s.label);
  if (missing.length) return setStatus(status, 'Missing scenes: ' + missing.join(', '), 'error');

  setStatus(status, 'Building book…', '');
  try {
    const imageGetter = async (path) => {
      const [scope, key] = path.split('/');
      if (scope === 'char') {
        const dataUrl = CUSTOM_FILES[key];
        return dataUrlToArrayBuffer(dataUrl);
      } else if (scope === 'bg') {
        const res = await fetch(`assets/backgrounds/${key}.jpg`);
        return await res.arrayBuffer();
      }
      throw new Error('Unknown scope: ' + scope);
    };

    const pdfBytes = await buildBook(name, imageGetter);
    const filename = `Goodnight_${sanitize(name)}_custom.pdf`;
    downloadBlob(pdfBytes, filename);
    setStatus(status, `✓ ${filename} downloaded`, 'success');
    logOrder({ mode:'custom', character:'custom', name, filename, ts:Date.now() });
  } catch (err) {
    console.error(err);
    setStatus(status, 'Error: ' + err.message, 'error');
  }
}

// ---------- PDF builder ----------
async function buildBook(name, imageGetter) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  const fonts = {
    helv:        await pdfDoc.embedFont(StandardFonts.Helvetica),
    helvBold:    await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    times:       await pdfDoc.embedFont(StandardFonts.TimesRoman),
    timesBold:   await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    timesItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
  };

  const sub = (s) => s.replace(/\{NAME\}/g, name);

  const embedImage = async (path) => {
    const buf = await imageGetter(path);
    const head = new Uint8Array(buf, 0, 3);
    if (head[0] === 0xFF && head[1] === 0xD8) return await pdfDoc.embedJpg(buf);
    return await pdfDoc.embedPng(buf);
  };

  // ----- Page 1: Cover -----
  const coverImg = await embedImage('char/cover');
  const cover = pdfDoc.addPage([PAGE, PAGE]);
  // Top illustration (occupies top 72%)
  const bandH = 162;
  cover.drawImage(coverImg, { x: 0, y: bandH, width: PAGE, height: PAGE - bandH });
  // Navy band
  cover.drawRectangle({ x: 0, y: 0, width: PAGE, height: bandH, color: rgb(NAVY.r, NAVY.g, NAVY.b) });
  drawSpacedText(cover, 'LITTLE TAILS CO.', 142, 9, fonts.helvBold, WHITE, 4);
  drawCentered(cover, 'Goodnight, Little', 110, 22, fonts.timesBold, WHITE);
  drawCentered(cover, name, 55, 44, fonts.helvBold, YELLOW);
  drawCentered(cover, CONFIG.brand.tagline, 18, 9, fonts.timesItalic, WHITE);

  // ----- Page 2: Title page (cream) -----
  const title = pdfDoc.addPage([PAGE, PAGE]);
  fillBg(title, CREAM);
  drawCrescent(title, PAGE/2, 470, 22, YELLOW, CREAM);
  drawSpacedText(title, 'LITTLE TAILS CO.', 410, 11, fonts.helvBold, NAVY, 5);
  drawCentered(title, 'Goodnight, Little', 320, 32, fonts.timesBold, NAVY);
  drawCentered(title, name, 230, 56, fonts.helvBold, YELLOW);
  drawCentered(title, CONFIG.brand.tagline, 130, 11, fonts.timesItalic, NAVY);

  // ----- Page 3: Dedication -----
  const ded = pdfDoc.addPage([PAGE, PAGE]);
  fillBg(ded, CREAM);
  drawCrescent(ded, 50, 520, 14, YELLOW, CREAM);
  drawCrescent(ded, PAGE - 50, 520, 14, YELLOW, CREAM);
  drawCrescent(ded, 50, 56, 14, YELLOW, CREAM);
  drawCrescent(ded, PAGE - 50, 56, 14, YELLOW, CREAM);
  drawCentered(ded, sub(CONFIG.dedication.linePre), 360, 18, fonts.timesItalic, NAVY);
  drawCentered(ded, name, 270, 60, fonts.helvBold, YELLOW);
  drawCentered(ded, sub(CONFIG.dedication.linePost), 200, 16, fonts.times, NAVY);

  // ----- Spreads (14 × 2 pages) -----
  for (const spread of CONFIG.spreads) {
    // Image page
    const imgPg = pdfDoc.addPage([PAGE, PAGE]);
    const sceneImg = await embedImage(spread.image);
    imgPg.drawImage(sceneImg, { x: 0, y: 0, width: PAGE, height: PAGE });

    // Text page
    const txtPg = pdfDoc.addPage([PAGE, PAGE]);
    fillBg(txtPg, CREAM);
    drawCrescent(txtPg, PAGE - 60, PAGE - 60, 18, YELLOW, CREAM);
    drawStar(txtPg, 60, 70, 8, YELLOW);

    const line1 = sub(spread.lines[0]);
    const line2 = sub(spread.lines[1]);
    drawNameAwareLine(txtPg, line1, 320, 22, fonts, NAVY, name);
    drawNameAwareLine(txtPg, line2, 270, 22, fonts, NAVY, name);

    // page number bottom-right
    const pn = '· ' + spread.page + ' ·';
    const pnW = fonts.times.widthOfTextAtSize(pn, 9);
    txtPg.drawText(pn, { x: PAGE - pnW - 36, y: 28, size: 9, font: fonts.times, color: rgb(NAVY.r, NAVY.g, NAVY.b) });
  }

  // ----- Back cover -----
  const back = pdfDoc.addPage([PAGE, PAGE]);
  fillBg(back, NAVY);
  drawSpacedText(back, 'LITTLE TAILS CO.', 545, 11, fonts.helvBold, WHITE, 5);
  const thumb = await embedImage(CONFIG.back.thumb);
  back.drawImage(thumb, { x: PAGE/2 - 95, y: 320, width: 190, height: 190 });
  drawWrapped(back, sub(CONFIG.back.marketing), 60, 290, PAGE - 120, 10, fonts.times, WHITE, 14);
  drawWrapped(back, CONFIG.back.subline, 60, 200, PAGE - 120, 10, fonts.timesItalic, WHITE, 12);
  drawSegmentLine(back, sub(CONFIG.back.customMade), 125, 14, fonts, WHITE, YELLOW, name);
  drawCentered(back, CONFIG.brand.tagline, 70, 9, fonts.timesItalic, WHITE);

  return await pdfDoc.save();
}

// ---------- Drawing primitives ----------
function fillBg(page, color) {
  const { rgb } = PDFLib;
  page.drawRectangle({ x: 0, y: 0, width: PAGE, height: PAGE, color: rgb(color.r, color.g, color.b) });
}

function drawCentered(page, text, y, size, font, color) {
  const { rgb } = PDFLib;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE - w) / 2, y, size, font, color: rgb(color.r, color.g, color.b) });
}

function drawSpacedText(page, text, y, size, font, color, gap) {
  const { rgb } = PDFLib;
  const chars = text.split('');
  const widths = chars.map(c => font.widthOfTextAtSize(c, size));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = (PAGE - total) / 2;
  for (let i = 0; i < chars.length; i++) {
    page.drawText(chars[i], { x, y, size, font, color: rgb(color.r, color.g, color.b) });
    x += widths[i] + gap;
  }
}

function drawNameAwareLine(page, text, y, size, fonts, baseColor, name) {
  const { rgb } = PDFLib;
  const baseFont = fonts.timesBold;
  const accentFont = fonts.helvBold;
  const baseRgb = rgb(baseColor.r, baseColor.g, baseColor.b);
  const accentRgb = rgb(YELLOW.r, YELLOW.g, YELLOW.b);

  const segs = [];
  let rest = text;
  while (rest.length) {
    const i = rest.indexOf(name);
    if (i === -1) { segs.push({ t: rest, f: baseFont, c: baseRgb }); break; }
    if (i > 0)  segs.push({ t: rest.slice(0, i), f: baseFont, c: baseRgb });
    segs.push({ t: name, f: accentFont, c: accentRgb });
    rest = rest.slice(i + name.length);
  }

  let total = 0;
  for (const s of segs) total += s.f.widthOfTextAtSize(s.t, size);
  let x = (PAGE - total) / 2;
  for (const s of segs) {
    page.drawText(s.t, { x, y, size, font: s.f, color: s.c });
    x += s.f.widthOfTextAtSize(s.t, size);
  }
}

function drawSegmentLine(page, text, y, size, fonts, baseColor, accentColor, name) {
  const { rgb } = PDFLib;
  const baseFont = fonts.times;
  const accentFont = fonts.helvBold;
  const baseRgb = rgb(baseColor.r, baseColor.g, baseColor.b);
  const accentRgb = rgb(accentColor.r, accentColor.g, accentColor.b);
  const segs = [];
  const i = text.indexOf(name);
  if (i === -1) {
    segs.push({ t: text, f: baseFont, c: baseRgb });
  } else {
    if (i > 0) segs.push({ t: text.slice(0, i), f: baseFont, c: baseRgb });
    segs.push({ t: name, f: accentFont, c: accentRgb });
    if (i + name.length < text.length) segs.push({ t: text.slice(i + name.length), f: baseFont, c: baseRgb });
  }
  let total = 0;
  for (const s of segs) total += s.f.widthOfTextAtSize(s.t, size);
  let x = (PAGE - total) / 2;
  for (const s of segs) {
    page.drawText(s.t, { x, y, size, font: s.f, color: s.c });
    x += s.f.widthOfTextAtSize(s.t, size);
  }
}

function drawWrapped(page, text, x, y, maxWidth, size, font, color, lineHeight) {
  const { rgb } = PDFLib;
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      lines.push(line); line = word;
    } else line = trial;
  }
  if (line) lines.push(line);

  let cy = y;
  for (const ln of lines) {
    const lw = font.widthOfTextAtSize(ln, size);
    page.drawText(ln, { x: x + (maxWidth - lw) / 2, y: cy, size, font, color: rgb(color.r, color.g, color.b) });
    cy -= lineHeight;
  }
}

function drawCrescent(page, cx, cy, r, color, bgColor) {
  const { rgb } = PDFLib;
  page.drawCircle({ x: cx, y: cy, size: r, color: rgb(color.r, color.g, color.b) });
  page.drawCircle({ x: cx + r * 0.42, y: cy + r * 0.10, size: r * 0.92, color: rgb(bgColor.r, bgColor.g, bgColor.b) });
}

function drawDot(page, cx, cy, r, color) {
  const { rgb } = PDFLib;
  page.drawCircle({ x: cx, y: cy, size: r, color: rgb(color.r, color.g, color.b) });
}

// 5-point star, point UP. Outer radius R, inner radius 0.4R.
// SVG path uses y-down convention; pdf-lib auto-flips when drawing onto a PDF page.
function drawStar(page, cx, cy, R, color) {
  const { rgb } = PDFLib;
  const inner = R * 0.4;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const radius = (i % 2 === 0) ? R : inner;
    const angleDeg = -90 + (i * 36); // start at top, go clockwise
    const a = angleDeg * Math.PI / 180;
    pts.push([
      (Math.cos(a) * radius).toFixed(2),
      (Math.sin(a) * radius).toFixed(2)
    ]);
  }
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < 10; i++) path += ` L ${pts[i][0]} ${pts[i][1]}`;
  path += ' Z';
  page.drawSvgPath(path, {
    x: cx,
    y: cy,
    color: rgb(color.r, color.g, color.b),
  });
}

// ---------- Utilities ----------
function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

function downloadBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function sanitize(s) { return s.replace(/[^A-Za-z0-9]/g, ''); }

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = 'status-msg' + (kind ? ' ' + kind : '');
}

// ---------- Order log ----------
function logOrder(entry) {
  const log = JSON.parse(localStorage.getItem('lt_log') || '[]');
  log.unshift(entry);
  localStorage.setItem('lt_log', JSON.stringify(log.slice(0, 50)));
  renderOrderLog();
}

function renderOrderLog() {
  const log = JSON.parse(localStorage.getItem('lt_log') || '[]');
  const div = document.getElementById('order-log');
  if (!log.length) {
    div.innerHTML = '<p style="opacity:0.6;font-style:italic;">No orders generated yet on this device.</p>';
    return;
  }
  let html = '<table><thead><tr><th>When</th><th>Mode</th><th>Character</th><th>Name</th><th>File</th></tr></thead><tbody>';
  for (const e of log) {
    const when = new Date(e.ts).toLocaleString();
    html += `<tr><td>${when}</td><td>${e.mode}</td><td>${e.character}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.filename)}</td></tr>`;
  }
  html += '</tbody></table>';
  div.innerHTML = html;
}

function clearLog() {
  if (confirm('Clear the order log on this device?')) {
    localStorage.removeItem('lt_log');
    renderOrderLog();
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Boot
init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<div style="padding:20px;background:#fee;color:#c00;font-family:monospace;">Init error: ${err.message}</div>`);
});
