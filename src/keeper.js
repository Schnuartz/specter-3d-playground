import { createDemoFiles } from '../runtime/demo-data.js';
import { qrCanvas, decodeCanvas } from './qr.js';
import { truncate } from './util.js';

const W = 360;
const H = 720;
const ADDR = 'tb1qem2p9awpmhyts2rrg7wxnze0qm4znep7zl032qwrh0yy4m36364qhza3rn';

export class KeeperApp {
  constructor({ deviceScreenCanvas, onToast }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.overlayCanvas = document.getElementById('keeper-canvas');
    this.overlayCanvas.width = W;
    this.overlayCanvas.height = H;
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.panel = document.getElementById('keeper-panel');
    this.deviceScreenCanvas = deviceScreenCanvas;
    this.onToast = onToast || (() => {});
    this.phoneTexture = null;
    this.phone = null;
    this.view = 'home';
    this.psbt = null;
    this.signed = false;
    this.showQr = false;
    this.result = '';
    this.deviceState = 'offline';
    this.hitRegions = [];
    this._wire();
    this.draw();
  }

  attachPhone(phone) {
    this.phone = phone;
    this.phoneTexture = phone?.userData?.screenTexture || null;
    this.draw();
  }

  setDeviceState(text) {
    this.deviceState = text;
    this.draw();
  }

  _wire() {
    document.getElementById('keeper-close')?.addEventListener('click', () => this.close());
    document.getElementById('keeper-reset')?.addEventListener('click', () => this._action('reset'));
    this.overlayCanvas.addEventListener('click', event => {
      const rect = this.overlayCanvas.getBoundingClientRect();
      this.handleClick(
        (event.clientX - rect.left) / rect.width * W,
        (event.clientY - rect.top) / rect.height * H,
      );
    });
  }

  open() {
    this.panel.hidden = false;
    requestAnimationFrame(() => this.panel.classList.add('open'));
    this.draw();
  }

  close() {
    this.panel.classList.remove('open');
    setTimeout(() => { this.panel.hidden = true; }, 240);
  }

  setView(view) {
    this.view = view;
    this.draw();
  }

  createPsbt() {
    const demo = createDemoFiles('testnet');
    const file = demo.files.find(f => f.name === 'testnet-ghost-payment-low-fee.psbt') || demo.files.find(f => f.name.endsWith('.psbt'));
    if (!file) { this.onToast('Keine Demo-PSBT gefunden.', 'err'); return; }
    this.psbt = new TextDecoder().decode(file.bytes).trim();
    this.signed = false;
    this.showQr = true;
    this.result = '';
    this.onToast('Keeper-PSBT erzeugt. QR am Handy sichtbar.', 'ok');
    this.draw();
  }

  showQrCode() {
    if (!this.psbt) this.createPsbt();
    this.showQr = true;
    this.draw();
    this.onToast('PSBT-QR sichtbar. Mit Specter scannen.', 'info');
  }

  scanSigned() {
    if (!this.deviceScreenCanvas) { this.result = 'Kein Gerätedisplay verfügbar.'; this.draw(); return; }
    const decoded = decodeCanvas(this.deviceScreenCanvas);
    if (!decoded) {
      this.result = 'Kein QR auf dem Specter-Display erkannt. Signierten PSBT-QR anzeigen.';
      this.onToast('Kein QR auf dem Gerät erkannt.', 'err');
      this.draw();
      return;
    }
    const text = decoded.text.trim();
    if (!/^cHNidP/i.test(text) && !/^ur:/i.test(text) && !/^psbt/i.test(text)) {
      this.result = `QR gelesen, aber kein PSBT: ${truncate(text, 70)}`;
      this.draw();
      return;
    }
    this.signed = true;
    this.psbt = text;
    this.result = `SIGNIERTER PSBT EMPFANGEN\n${truncate(text, 140)}\n\nBereit für Broadcast (simuliert).`;
    this.onToast('Signierter PSBT vom Specter gelesen.', 'ok');
    this.draw();
  }

  handleClick(x, y) {
    for (const r of this.hitRegions) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this._action(r.action);
        return;
      }
    }
  }

  _action(action) {
    if (action === 'home') this.setView('home');
    else if (action === 'receive') this.setView('receive');
    else if (action === 'send') this.setView('send');
    else if (action === 'scan') this.setView('scan');
    else if (action === 'settings') this.setView('settings');
    else if (action === 'back') this.setView('home');
    else if (action === 'create') this.createPsbt();
    else if (action === 'showQr') this.showQrCode();
    else if (action === 'scanSigned') this.scanSigned();
    else if (action === 'reset') { this.psbt = null; this.signed = false; this.showQr = false; this.result = ''; this.setView('home'); }
  }

  draw() {
    const ctx = this.ctx;
    this.hitRegions = [];
    const cream = '#f6f4ef';
    const ink = '#1e2a26';
    const muted = '#7b8580';
    const green = '#b2d17d';
    const orange = '#f7931a';
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(30,42,38,.85)';
    ctx.font = '700 12px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('9:41', 20, 26);
    ctx.textAlign = 'right';
    ctx.fillText('TESTNET', W - 20, 26);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(30,42,38,.16)';
    ctx.fillRect(W / 2 - 38, 8, 76, 20);
    ctx.fillStyle = '#030405';
    ctx.beginPath(); ctx.roundRect(W / 2 - 30, 11, 60, 14, 7); ctx.fill();

    if (this.view === 'home') this._drawHome(ctx, ink, muted, green, orange);
    else if (this.view === 'receive') this._drawReceive(ctx, ink, muted, green);
    else if (this.view === 'send') this._drawSend(ctx, ink, muted, green, orange);
    else if (this.view === 'scan') this._drawScan(ctx, ink, muted, green);
    else if (this.view === 'settings') this._drawSettings(ctx, ink, muted, green);

    if (this.view !== 'scan') this._nav(ctx, ink, muted);
    this.overlayCtx.drawImage(this.canvas, 0, 0);
    if (this.phoneTexture) this.phoneTexture.needsUpdate = true;
  }

  _button(ctx, x, y, w, h, label, action, opts = {}) {
    ctx.fillStyle = opts.bg || 'rgba(30,42,38,.07)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(30,42,38,.16)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = opts.fg || '#1e2a26';
    ctx.font = `700 ${opts.size || 12}px -apple-system, Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
    this.hitRegions.push({ x, y, w, h, action });
  }

  _nav(ctx, ink, muted) {
    const y = H - 64;
    ctx.fillStyle = 'rgba(246,244,239,.97)';
    ctx.fillRect(0, y, W, 64);
    ctx.strokeStyle = 'rgba(30,42,38,.1)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    const items = [['Home', 'home'], ['Scan', 'scan'], ['Settings', 'settings']];
    items.forEach(([label, action], i) => {
      const x = 24 + i * 112;
      const active = (action === 'home' && this.view === 'home') || (action === 'scan' && this.view === 'scan') || (action === 'settings' && this.view === 'settings');
      ctx.fillStyle = active ? ink : muted;
      ctx.font = `${active ? 700 : 500} 10px -apple-system, Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 40, y + 40);
      ctx.textAlign = 'left';
      this.hitRegions.push({ x, y: y + 14, w: 80, h: 42, action });
    });
  }

  _drawHome(ctx, ink, muted, green, orange) {
    ctx.fillStyle = ink;
    ctx.font = '800 22px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Bitcoin Keeper', 24, 88);
    ctx.fillStyle = muted;
    ctx.font = '500 11px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Selbstverwahrung · Testnet Demo', 24, 106);
    ctx.fillStyle = 'rgba(30,42,38,.05)';
    ctx.beginPath(); ctx.roundRect(20, 126, 320, 122, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(30,42,38,.1)'; ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = '600 9px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('GESAMTBALANCE (SIMULIERT)', 36, 152);
    ctx.fillStyle = ink;
    ctx.font = '800 30px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('0.0421 BTC', 36, 188);
    ctx.fillStyle = green;
    ctx.font = '700 11px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('≈ $1,842.10 · +2.4%', 36, 208);
    ctx.fillStyle = muted;
    ctx.font = '500 9px monospace';
    ctx.fillText('tb1qem2p9awpmhyts2rrg7wxnze0qm4znep…', 36, 230);
    this._button(ctx, 24, 264, 150, 42, 'Receive', 'receive', { bg: 'rgba(178,209,125,.22)', border: 'rgba(178,209,125,.55)', fg: '#38521f' });
    this._button(ctx, 186, 264, 150, 42, 'Send', 'send', { bg: 'rgba(247,147,26,.16)', border: 'rgba(247,147,26,.4)', fg: '#7a4200' });
    ctx.fillStyle = ink;
    ctx.font = '700 13px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Vaults', 24, 340);
    const vaults = [['Ghost Vault', '2-of-3 · 0.021 BTC'], ['Zoo Vault', '2-of-3 · 0.014 BTC'], ['Mirror Vault', 'Watch-only · 0.007 BTC']];
    vaults.forEach(([name, sub], i) => {
      const y = 354 + i * 66;
      ctx.fillStyle = 'rgba(30,42,38,.05)';
      ctx.beginPath(); ctx.roundRect(20, y, 320, 56, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(30,42,38,.09)'; ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '700 12px -apple-system, Segoe UI, sans-serif';
      ctx.fillText(name, 36, y + 24);
      ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif';
      ctx.fillText(sub, 36, y + 42);
      ctx.fillStyle = green; ctx.font = '700 16px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('›', 322, y + 34); ctx.textAlign = 'left';
    });
    ctx.fillStyle = ink; ctx.font = '700 13px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Letzte Aktivität', 24, 568);
    ctx.fillStyle = muted; ctx.font = '500 10px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Empfangen · 0.0100 BTC · heute', 24, 590);
    ctx.fillText('Gesendet · 0.0015 BTC · gestern', 24, 610);
    ctx.fillStyle = 'rgba(30,42,38,.06)'; ctx.beginPath(); ctx.roundRect(20, 626, 320, 30, 10); ctx.fill();
    ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Demo-Daten · keine echten Funds', 36, 646);
  }

  _drawReceive(ctx, ink, muted, green) {
    ctx.fillStyle = ink; ctx.font = '800 20px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Empfangen', 24, 92);
    this._button(ctx, 280, 70, 58, 30, 'Zurück', 'back', { size: 10 });
    ctx.fillStyle = muted; ctx.font = '500 10px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Ghost Vault · Testnet', 24, 114);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(52, 140, 256, 256, 18); ctx.fill();
    const qr = qrCanvas(ADDR, 230, 'M');
    ctx.imageSmoothingEnabled = false; ctx.drawImage(qr, 65, 153, 230, 230); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = ink; ctx.font = '700 11px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('tb1qem2p9awpmhyts2rrg7wxnze0qm4znep…', 180, 426);
    ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('QR mit Specter DIY scannen', 180, 448);
    ctx.textAlign = 'left';
    this._button(ctx, 24, 470, 312, 38, 'Adresse kopieren (simuliert)', 'copy', { bg: 'rgba(178,209,125,.18)', border: 'rgba(178,209,125,.5)' });
  }

  _drawSend(ctx, ink, muted, green, orange) {
    ctx.fillStyle = ink; ctx.font = '800 20px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Senden', 24, 92);
    this._button(ctx, 280, 70, 58, 30, 'Zurück', 'back', { size: 10 });
    ctx.fillStyle = muted; ctx.font = '500 10px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Ghost Vault · 2-of-3 · Testnet', 24, 114);
    ctx.fillStyle = 'rgba(30,42,38,.05)'; ctx.beginPath(); ctx.roundRect(20, 132, 320, 100, 14); ctx.fill();
    ctx.fillStyle = muted; ctx.font = '600 9px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('BETRAG', 36, 156);
    ctx.fillStyle = ink; ctx.font = '800 26px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('0.00150000 BTC', 36, 190);
    ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Empfänger: tb1qk0a9hr7wjfxeenz9nwenw9flhq0tmsf6vsgnn2', 36, 214);
    this._button(ctx, 24, 250, 150, 38, 'PSBT erzeugen', 'create', { bg: 'rgba(247,147,26,.18)', border: 'rgba(247,147,26,.45)', fg: '#7a4200' });
    this._button(ctx, 186, 250, 150, 38, 'QR zeigen', 'showQr', { bg: 'rgba(30,42,38,.07)' });
    if (this.showQr && this.psbt) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(66, 306, 228, 228, 16); ctx.fill();
      const q = qrCanvas(this.psbt, 200, this.psbt.length > 700 ? 'L' : 'M');
      ctx.imageSmoothingEnabled = false; ctx.drawImage(q, 80, 320, 200, 200); ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PSBT-QR · mit Specter scannen', 180, 550);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = muted; ctx.font = '500 10px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('PSBT erzeugen und als QR zeigen. Specter signiert offline.', 24, 330);
    }
    this._button(ctx, 24, 566, 312, 38, 'Signierten QR vom Specter scannen', 'scanSigned', { bg: 'rgba(178,209,125,.2)', border: 'rgba(178,209,125,.55)' });
    if (this.result) {
      ctx.fillStyle = this.signed ? '#3c7a3f' : muted;
      ctx.font = '500 9px monospace';
      this.result.split('\n').slice(0, 3).forEach((line, i) => ctx.fillText(truncate(line, 58), 24, 620 + i * 14));
    }
  }

  _drawScan(ctx, ink, muted, green) {
    ctx.fillStyle = ink; ctx.font = '800 20px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Scan', 24, 92);
    this._button(ctx, 280, 70, 58, 30, 'Zurück', 'back', { size: 10 });
    ctx.fillStyle = muted; ctx.font = '500 10px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Liest den signierten PSBT-QR vom Specter-Display.', 24, 114);
    ctx.fillStyle = '#0b0f0e'; ctx.beginPath(); ctx.roundRect(48, 134, 264, 352, 18); ctx.fill();
    if (this.deviceScreenCanvas) {
      try { ctx.drawImage(this.deviceScreenCanvas, 58, 144, 244, 332); } catch {}
    }
    ctx.strokeStyle = 'rgba(178,209,125,.7)'; ctx.setLineDash([6, 6]); ctx.strokeRect(70, 156, 220, 308); ctx.setLineDash([]);
    ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Specter Display · Live', 180, 500); ctx.textAlign = 'left';
    this._button(ctx, 24, 518, 312, 38, 'Jetzt scannen', 'scanSigned', { bg: 'rgba(178,209,125,.22)', border: 'rgba(178,209,125,.55)' });
    if (this.result) {
      ctx.fillStyle = this.signed ? '#3c7a3f' : muted;
      ctx.font = '500 9px monospace';
      ctx.fillText(truncate(this.result.split('\n')[0], 58), 24, 574);
    }
  }

  _drawSettings(ctx, ink, muted) {
    ctx.fillStyle = ink; ctx.font = '800 20px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Settings', 24, 92);
    this._button(ctx, 280, 70, 58, 30, 'Zurück', 'back', { size: 10 });
    const rows = [['Netzwerk', 'Testnet'], ['Gerät', 'Specter DIY · 3D'], ['Gerätestatus', this.deviceState], ['Version', 'Keeper Browser 0.1'], ['Daten', 'Session-only Demo']];
    rows.forEach(([k, v], i) => {
      const y = 130 + i * 54;
      ctx.fillStyle = 'rgba(30,42,38,.04)'; ctx.beginPath(); ctx.roundRect(20, y, 320, 42, 11); ctx.fill();
      ctx.fillStyle = muted; ctx.font = '500 10px -apple-system, Segoe UI, sans-serif'; ctx.fillText(k, 34, y + 25);
      ctx.fillStyle = ink; ctx.font = '700 11px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(v, 326, y + 25); ctx.textAlign = 'left';
    });
    this._button(ctx, 24, 440, 312, 38, 'Keeper-Session zurücksetzen', 'reset', { bg: 'rgba(255,120,120,.12)', border: 'rgba(255,120,120,.35)', fg: '#8a3333' });
    ctx.fillStyle = muted; ctx.font = '500 9px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Nur Testdaten. Keine echten Seeds oder Funds.', 24, 510);
  }
}
