import { createDemoFiles } from '../runtime/demo-data.js';
import { qrCanvas, decodeCanvas } from './qr.js';
import { truncate } from './util.js';

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export class Airgap {
  constructor({ world, runtime, getStateFiles, onWriteSd, onEjectSd, onToast }) {
    this.world = world;
    this.runtime = runtime;
    this.getStateFiles = getStateFiles;
    this.onWriteSd = onWriteSd;
    this.onEjectSd = onEjectSd;
    this.onToast = onToast || (() => {});
    this.view = 'wallet';
    this.showQr = false;
    this.signed = false;
    this.sdFiles = [];
    this.psbt = null;
    this.hitRegions = [];
    this.lastCamDraw = 0;
    this.camLoop = null;
    this.panel = document.getElementById('airgap-panel');
    this.camCanvas = document.getElementById('ag-cam-canvas');
    this.camCanvas.width = 480;
    this.camCanvas.height = 800;
    this.camCtx = this.camCanvas.getContext('2d');
    this._wire();
    this.draw();
  }

  _wire() {
    document.querySelectorAll('.ag-nav button').forEach(btn => {
      btn.addEventListener('click', () => this.setView(btn.dataset.agView));
    });
    document.getElementById('ag-close').addEventListener('click', () => this.close());
    document.getElementById('ag-create').addEventListener('click', () => this.createPsbt(this.currentKind()));
    document.getElementById('ag-show-qr').addEventListener('click', () => this.showQrCode());
    document.getElementById('ag-write-sd').addEventListener('click', () => this.writeSd());
    document.getElementById('ag-scan-device').addEventListener('click', () => this.scanDevice());
    document.getElementById('ag-scan-run').addEventListener('click', () => this.scanDevice());
    document.getElementById('ag-sd-write').addEventListener('click', () => this.writeSd());
    document.getElementById('ag-sd-read').addEventListener('click', () => this.readSd());
    document.getElementById('ag-sd-eject').addEventListener('click', () => this.onEjectSd?.());
  }

  open() {
    this.panel.hidden = false;
    requestAnimationFrame(() => this.panel.classList.add('open'));
    this.setView(this.view);
    this._startCamLoop();
  }

  close() {
    this.panel.classList.remove('open');
    setTimeout(() => { this.panel.hidden = true; }, 260);
    this._stopCamLoop();
  }

  setView(view) {
    this.view = view;
    document.querySelectorAll('.ag-nav button').forEach(b => b.classList.toggle('active', b.dataset.agView === view));
    document.querySelectorAll('.ag-view').forEach(p => p.classList.toggle('active', p.dataset.agPage === view));
    this.draw();
  }

  setDeviceState(text) {
    const el = document.getElementById('ag-device-state');
    if (el) el.textContent = text;
  }

  currentKind() {
    return document.getElementById('ag-kind')?.value || 'low';
  }

  createPsbt(kind = 'low') {
    const demo = createDemoFiles('testnet');
    const names = {
      low: 'testnet-ghost-payment-low-fee.psbt',
      high: 'testnet-ghost-payment-high-fee.psbt',
      multisig: 'testnet-multisig-unsigned.psbt',
    };
    const file = demo.files.find(f => f.name === names[kind]) || demo.files.find(f => f.name.endsWith('.psbt'));
    if (!file) { this.onToast('Kein PSBT in den Demo-Daten gefunden.', 'err'); return; }
    const payload = new TextDecoder().decode(file.bytes).trim();
    const id = hash32(payload);
    this.psbt = {
      title: kind === 'multisig' ? 'Multisig · Ghost + Zoo + Mirror' : 'Testnet Ghost → Zoo',
      amount: kind === 'multisig' ? '0.00420000 BTC' : '0.00150000 BTC',
      fee: kind === 'high' ? '1.840 sats' : kind === 'multisig' ? '320 sats' : '142 sats',
      recipient: 'tb1qk0a9hr7wjfxeenz9nwenw9flhq0tmsf6vsgnn2',
      payload,
      id: `psbt_${id}`,
      signed: false,
      kind,
    };
    this.signed = false;
    this.showQr = false;
    this._updatePanel();
    this.world.setCardPayload(this.world.qrCards[1], payload, 'PSBT · airgap');
    this.world.qrCards[1].position.set(0.02, 0.19, 0.32);
    this.world.qrCards[1].rotation.set(0, 0, 0);
    this.world.qrCards[1].userData.scanning = true;
    this.world.qrCards[1].userData.scanHome = this.world.qrCards[1].position.clone();
    this.onToast('PSBT erzeugt. Auf dem Gerät „Scan QR code“ öffnen.', 'info');
    this.setView('psbt');
    this.draw();
  }

  showQrCode() {
    if (!this.psbt) this.createPsbt(this.currentKind());
    this.showQr = true;
    this.setView('psbt');
    this.draw();
    const card = this.world.qrCards[1];
    this.world.setCardPayload(card, this.psbt.payload, 'PSBT · airgap');
    this.world.focusScanCard(1);
    this.onToast('QR liegt jetzt im Scan-Bereich. Am Gerät Scanner öffnen.', 'info');
  }

  async scanDevice() {
    this.setView('scan');
    const canvas = this.world.screenCanvas;
    const result = decodeCanvas(canvas);
    const out = document.getElementById('ag-scan-result');
    if (!result) {
      out.className = 'ag-result err';
      out.textContent = 'Kein QR auf dem Gerät erkannt. Der signierte PSBT-QR muss auf dem Display sichtbar sein.';
      return;
    }
    const text = result.text.trim();
    const isPsbt = /^cHNidP/i.test(text) || /^psbt/i.test(text) || /^cHNl/i.test(text);
    if (!isPsbt) {
      out.className = 'ag-result err';
      out.textContent = `QR gelesen, aber kein PSBT: ${truncate(text, 90)}`;
      return;
    }
    this.signed = true;
    this.psbt = { ...(this.psbt || {}), payload: text, signed: true };
    out.className = 'ag-result ok';
    out.textContent = `SIGNIERTER PSBT EMPFANGEN\n${truncate(text, 180)}\n\nLänge: ${text.length} Zeichen · Signatur im Gerät erzeugt.`;
    this.onToast('Signierter PSBT vom Specter-Display gelesen.', 'ok');
    this._updatePanel();
    this.draw();
  }

  writeSd() {
    if (!this.psbt) this.createPsbt(this.currentKind());
    this.onWriteSd?.(this.psbt.payload, 'airgap-unsigned.psbt');
    this._sdLog('PSBT → SD geschrieben. Karte in Specter einsetzen und „Open SD card file“ wählen.');
  }

  async readSd() {
    const files = await this.getStateFiles();
    this.sdFiles = files.filter(f => f.path.startsWith('sd/'));
    const signedFile = this.sdFiles.find(f => /\.signed.*\.psbt$/i.test(f.path)) || this.sdFiles.find(f => /signed/i.test(f.path));
    if (signedFile) {
      const text = new TextDecoder().decode(signedFile.bytes);
      this.psbt = { ...(this.psbt || {}), payload: text.trim(), signed: true };
      this.signed = true;
      this._sdLog(`Signierte Datei gelesen: ${signedFile.path}\n${truncate(text, 200)}`);
      this.onToast('Signierter PSBT auf der SD-Karte gefunden.', 'ok');
    } else {
      this._sdLog(`Keine signierte Datei gefunden. Dateien auf SD: ${this.sdFiles.length ? this.sdFiles.map(f => f.path.slice(3)).join(', ') : 'keine'}`);
    }
    this._updatePanel();
    this.draw();
  }

  _sdLog(text) {
    const el = document.getElementById('ag-sd-log');
    if (el) el.textContent = `${new Date().toLocaleTimeString()}  ${text}\n` + el.textContent;
    this.setView('sd');
    this.draw();
  }

  _updatePanel() {
    const p = this.psbt;
    document.getElementById('ag-psbt-title').textContent = p ? p.title : 'Testnet Ghost → Zoo';
    document.getElementById('ag-amount').textContent = p ? p.amount : '0.00150000 BTC';
    document.getElementById('ag-fee').textContent = p ? p.fee : '142 sats';
    document.getElementById('ag-recipient').textContent = p ? p.recipient : 'tb1q…';
    document.getElementById('ag-psbt-id').textContent = p ? p.id : '—';
    const badge = document.querySelector('#ag-psbt .ag-psbt-head .badge');
    if (badge) {
      badge.textContent = p?.signed ? 'SIGNED' : 'UNSIGNED';
      badge.className = `badge ${p?.signed ? 'signed' : 'test'}`;
    }
    const qrCanvasEl = document.querySelector('#ag-qr canvas');
    if (qrCanvasEl && p) {
      qrCanvasEl.width = 320;
      qrCanvasEl.height = 320;
      const ctx = qrCanvasEl.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 320);
      const q = qrCanvas(p.payload, 300, p.payload.length > 700 ? 'L' : 'M');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(q, 10, 10, 300, 300);
      ctx.imageSmoothingEnabled = true;
    }
    const hint = document.querySelector('#ag-qr .ag-qr-hint');
    if (hint) hint.textContent = p?.signed ? 'Signierter PSBT' : 'QR am Laptop';
  }

  _startCamLoop() {
    if (this.camLoop) return;
    const tick = () => {
      if (this.panel.hidden || this.view !== 'scan') { this.camLoop = requestAnimationFrame(tick); return; }
      const now = performance.now();
      if (now - this.lastCamDraw > 120) {
        this.lastCamDraw = now;
        try {
          this.camCtx.drawImage(this.world.screenCanvas, 0, 0, 480, 800);
        } catch {}
      }
      this.camLoop = requestAnimationFrame(tick);
    };
    this.camLoop = requestAnimationFrame(tick);
  }

  _stopCamLoop() {
    if (this.camLoop) cancelAnimationFrame(this.camLoop);
    this.camLoop = null;
  }

  handleScreenClick(uv) {
    const x = uv.x * 1024;
    const y = (1 - uv.y) * 640;
    for (const r of this.hitRegions) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this._action(r.action);
        return true;
      }
    }
    return false;
  }

  _action(action) {
    if (action === 'create') this.createPsbt(this.currentKind());
    else if (action === 'showQr') this.showQrCode();
    else if (action === 'writeSd') this.writeSd();
    else if (action === 'scan') this.scanDevice();
    else if (action === 'readSd') this.readSd();
    else if (action === 'ejectSd') this.onEjectSd?.();
    else if (action === 'viewWallet') this.setView('wallet');
    else if (action === 'viewPsbt') this.setView('psbt');
    else if (action === 'viewScan') this.setView('scan');
    else if (action === 'viewSd') this.setView('sd');
  }

  draw() {
    const c = this.world.laptopScreenCanvas;
    const ctx = c.getContext('2d');
    this.hitRegions = [];
    const W = 1024, H = 640;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d1b2a'); bg.addColorStop(0.5, '#08111b'); bg.addColorStop(1, '#04080d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // desktop glow
    const glow = ctx.createRadialGradient(760, 160, 20, 760, 160, 460);
    glow.addColorStop(0, 'rgba(31,153,229,.16)'); glow.addColorStop(1, 'rgba(31,153,229,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    // menu bar
    ctx.fillStyle = 'rgba(4,7,10,.72)';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = 'rgba(240,247,255,.72)';
    ctx.font = '600 13px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTER DESKTOP', 18, 20);
    ctx.fillStyle = 'rgba(240,247,255,.36)';
    ctx.font = '400 12px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Wallet', 172, 20);
    ctx.fillText('File', 224, 20);
    ctx.fillText('View', 268, 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(82,214,138,.8)';
    ctx.fillText('● AIR-GAPPED', W - 18, 20);

    // window
    const wx = 46, wy = 48, ww = W - 92, wh = H - 80;
    ctx.fillStyle = 'rgba(8,13,19,.9)';
    ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(126,155,185,.2)'; ctx.lineWidth = 1; ctx.stroke();

    // sidebar
    ctx.fillStyle = 'rgba(15,22,32,.8)';
    ctx.beginPath(); ctx.roundRect(wx, wy, 210, wh, [16, 0, 0, 16]); ctx.fill();
    ctx.fillStyle = 'rgba(240,247,255,.92)';
    ctx.font = '700 15px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Specter Desktop', wx + 20, wy + 32);
    ctx.fillStyle = 'rgba(240,247,255,.35)';
    ctx.font = '400 10px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('air-gapped signing station', wx + 20, wy + 50);

    const nav = [
      ['Wallet', 'viewWallet'],
      ['PSBT', 'viewPsbt'],
      ['Scan', 'viewScan'],
      ['SD-Karte', 'viewSd'],
    ];
    nav.forEach(([label, action], i) => {
      const y = wy + 78 + i * 38;
      const active = (action === 'viewWallet' && this.view === 'wallet') || (action === 'viewPsbt' && this.view === 'psbt') ||
        (action === 'viewScan' && this.view === 'scan') || (action === 'viewSd' && this.view === 'sd');
      if (active) {
        ctx.fillStyle = 'rgba(31,153,229,.14)';
        ctx.beginPath(); ctx.roundRect(wx + 10, y - 19, 190, 30, 8); ctx.fill();
      }
      ctx.fillStyle = active ? '#65c7ff' : 'rgba(240,247,255,.4)';
      ctx.font = `${active ? 700 : 400} 12px -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(label, wx + 24, y + 2);
      this.hitRegions.push({ x: wx + 10, y: y - 19, w: 190, h: 30, action });
    });

    // wallet chip
    ctx.fillStyle = 'rgba(18,26,37,.7)';
    ctx.beginPath(); ctx.roundRect(wx + 14, wy + 248, 182, 92, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(126,155,185,.16)'; ctx.stroke();
    ctx.fillStyle = 'rgba(240,247,255,.36)'; ctx.font = '700 8px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('AKTIVE WALLET', wx + 28, wy + 270);
    ctx.fillStyle = '#f4f8fc'; ctx.font = '700 14px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Ghost · Testnet', wx + 28, wy + 292);
    ctx.fillStyle = 'rgba(82,214,138,.9)'; ctx.font = '700 8px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('2-of-3 MULTISIG', wx + 28, wy + 310);
    ctx.fillStyle = 'rgba(240,247,255,.28)'; ctx.font = '400 8px monospace';
    ctx.fillText('wsh(sortedmulti(2,…))', wx + 28, wy + 328);

    // main area
    const mx = wx + 230, my = wy + 24, mw = ww - 260, mh = wh - 48;
    this._drawMain(ctx, mx, my, mw, mh);

    // footer
    ctx.fillStyle = 'rgba(240,247,255,.24)'; ctx.font = '400 9px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO NETWORK · NO USB · QR / microSD ONLY · TEST DATA ONLY', W / 2, H - 14);

    this.world.laptopScreenCanvas.getContext('2d');
    if (this.world.laptop?.userData?.screenTexture) this.world.laptop.userData.screenTexture.needsUpdate = true;
  }

  _drawMain(ctx, x, y, w, h) {
    ctx.textAlign = 'left';
    if (this.view === 'wallet') {
      ctx.fillStyle = 'rgba(240,247,255,.4)'; ctx.font = '700 10px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('BALANCE (SIMULIERT)', x, y + 12);
      ctx.fillStyle = '#f4f8fc'; ctx.font = '700 40px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('0.04210000 BTC', x, y + 56);
      ctx.fillStyle = 'rgba(240,247,255,.32)'; ctx.font = '400 11px monospace';
      ctx.fillText('bc1qwq5rv3p3vp4duhejkd9l88m7umudte4fur4c6q', x, y + 78);
      const cards = [
        ['WALLET', 'Ghost + Zoo + Mirror', '2-of-3 Multisig'],
        ['GERÄT', 'Specter DIY', this.signed ? 'signiert' : 'bereit'],
        ['TRANSFER', 'QR / microSD', 'kein USB, kein Netz'],
      ];
      cards.forEach(([k, v, s], i) => {
        const cx = x + i * ((w - 20) / 3 + 10);
        ctx.fillStyle = 'rgba(18,26,37,.6)'; ctx.beginPath(); ctx.roundRect(cx, y + 104, (w - 20) / 3, 86, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(126,155,185,.14)'; ctx.stroke();
        ctx.fillStyle = 'rgba(240,247,255,.34)'; ctx.font = '700 8px -apple-system, Segoe UI, sans-serif';
        ctx.fillText(k, cx + 12, y + 124);
        ctx.fillStyle = '#f4f8fc'; ctx.font = '700 12px -apple-system, Segoe UI, sans-serif';
        ctx.fillText(v, cx + 12, y + 148);
        ctx.fillStyle = 'rgba(240,247,255,.3)'; ctx.font = '400 9px -apple-system, Segoe UI, sans-serif';
        ctx.fillText(s, cx + 12, y + 166);
      });
      this._button(ctx, x, y + 220, 200, 38, 'PSBT erzeugen', 'create', true);
      ctx.fillStyle = 'rgba(240,247,255,.3)'; ctx.font = '400 10px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('Erzeugt eine unsignierte Testnet-PSBT und zeigt sie als QR.', x, y + 284);
    } else if (this.view === 'psbt') {
      const p = this.psbt;
      ctx.fillStyle = '#f4f8fc'; ctx.font = '700 17px -apple-system, Segoe UI, sans-serif';
      ctx.fillText(p ? p.title : 'Noch keine PSBT', x, y + 14);
      if (p) {
        ctx.fillStyle = p.signed ? 'rgba(82,214,138,.85)' : 'rgba(244,184,96,.9)'; ctx.font = '700 9px -apple-system, Segoe UI, sans-serif';
        ctx.fillText(p.signed ? 'SIGNED' : 'UNSIGNED', x + w - 80, y + 14);
        const rows = [['Betrag', p.amount], ['Gebühr', p.fee], ['Empfänger', p.recipient], ['PSBT-ID', p.id]];
        rows.forEach(([k, v], i) => {
          ctx.fillStyle = 'rgba(240,247,255,.34)'; ctx.font = '400 9px -apple-system, Segoe UI, sans-serif';
          ctx.fillText(k, x, y + 46 + i * 22);
          ctx.fillStyle = 'rgba(240,247,255,.72)'; ctx.font = '400 10px monospace';
          ctx.fillText(v, x + 96, y + 46 + i * 22);
        });
        if (this.showQr) {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x + w - 250, y + 36, 230, 230, 10); ctx.fill();
          const q = qrCanvas(p.payload, 220, p.payload.length > 700 ? 'L' : 'M');
          ctx.imageSmoothingEnabled = false; ctx.drawImage(q, x + w - 245, y + 41, 220, 220); ctx.imageSmoothingEnabled = true;
        }
        this._button(ctx, x, y + 170, 156, 36, 'QR zeigen', 'showQr', true);
        this._button(ctx, x + 166, y + 170, 176, 36, 'Auf SD schreiben', 'writeSd', false);
        this._button(ctx, x, y + 214, 156, 36, 'Scan device', 'scan', false);
        if (p.signed) {
          ctx.fillStyle = 'rgba(82,214,138,.7)'; ctx.font = '400 9px monospace';
          ctx.fillText('Signatur vom Specter gelesen · bereit zum Broadcast (simuliert)', x, y + 280);
        }
      } else {
        this._button(ctx, x, y + 40, 200, 38, 'PSBT erzeugen', 'create', true);
      }
    } else if (this.view === 'scan') {
      ctx.fillStyle = '#f4f8fc'; ctx.font = '700 16px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('Device-Display scannen', x, y + 14);
      ctx.fillStyle = 'rgba(240,247,255,.34)'; ctx.font = '400 10px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('Das virtuelle Laptop-Webcam liest den signierten PSBT-QR.', x, y + 32);
      const camW = 220, camH = 300;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(x, y + 54, camW, camH, 10); ctx.fill();
      try { ctx.drawImage(this.world.screenCanvas, x + 10, y + 64, camW - 20, camH - 20); } catch {}
      ctx.strokeStyle = 'rgba(71,215,208,.5)'; ctx.setLineDash([6, 6]); ctx.strokeRect(x + 24, y + 78, camW - 48, camH - 48); ctx.setLineDash([]);
      this._button(ctx, x + camW + 24, y + 54, 160, 36, 'Jetzt scannen', 'scan', true);
      ctx.fillStyle = this.signed ? 'rgba(82,214,138,.75)' : 'rgba(240,247,255,.3)';
      ctx.font = '400 9px monospace';
      const txt = this.signed ? 'SIGNIERTER PSBT EMPFANGEN' : 'Noch keine Signatur gelesen.';
      ctx.fillText(txt, x + camW + 24, y + 118);
      if (this.psbt?.signed) {
        ctx.fillStyle = 'rgba(240,247,255,.5)'; ctx.font = '400 8px monospace';
        ctx.fillText(truncate(this.psbt.payload, 48), x + camW + 24, y + 138);
      }
    } else {
      ctx.fillStyle = '#f4f8fc'; ctx.font = '700 16px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('microSD-Austausch', x, y + 14);
      ctx.fillStyle = 'rgba(240,247,255,.34)'; ctx.font = '400 10px -apple-system, Segoe UI, sans-serif';
      ctx.fillText('PSBT auf die simulierte Karte schreiben, auf dem Gerät signieren, zurücklesen.', x, y + 32);
      this._button(ctx, x, y + 56, 150, 36, 'PSBT → SD', 'writeSd', true);
      this._button(ctx, x + 160, y + 56, 130, 36, 'SD lesen', 'readSd', false);
      this._button(ctx, x + 300, y + 56, 130, 36, 'Auswerfen', 'ejectSd', false);
      ctx.fillStyle = 'rgba(240,247,255,.3)'; ctx.font = '400 9px monospace';
      const list = this.sdFiles.length ? this.sdFiles.slice(0, 6).map(f => f.path.slice(3)).join('   ') : 'Keine Dateien geladen.';
      ctx.fillText(truncate(list, 80), x, y + 120);
    }
  }

  _button(ctx, x, y, w, h, label, action, primary) {
    ctx.fillStyle = primary ? 'rgba(31,153,229,.2)' : 'rgba(18,26,37,.7)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = primary ? 'rgba(31,153,229,.55)' : 'rgba(126,155,185,.28)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = primary ? '#c8eaff' : 'rgba(240,247,255,.6)';
    ctx.font = '700 11px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
    this.hitRegions.push({ x, y, w, h, action });
  }
}

