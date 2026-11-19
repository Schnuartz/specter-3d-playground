import { formatBytes, escapeHtml, truncate } from './util.js';
import { qrCanvas } from './qr.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

export class UI {
  constructor(actions = {}) {
    this.actions = actions;
    this.workbench = $('#workbench');
    this.panelOpen = false;
    this.soundOn = true;
    this.toastTimer = 0;
    this._wire();
  }

  _wire() {
    $('#wb-close').addEventListener('click', () => this.closeWorkbench());
    $('#dock-workbench').addEventListener('click', () => this.toggleWorkbench());
    $('#btn-help').addEventListener('click', () => this.openHelp());
    $('#help-close').addEventListener('click', () => this.closeHelp());
    $('#ob-start').addEventListener('click', () => this.hideOnboarding());
    $('#ob-help').addEventListener('click', () => { this.hideOnboarding(); this.openHelp(); });
    $('#btn-full').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    $('#btn-sound').addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      $('#btn-sound').classList.toggle('muted', !this.soundOn);
      this.actions.onSoundToggle?.(this.soundOn);
    });
    $$('.tab').forEach(tab => tab.addEventListener('click', () => this.selectTab(tab.dataset.tab)));
    $$('.dock-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.actions.onModeChange?.(btn.dataset.mode);
      });
    });
    $('#dock-airgap').addEventListener('click', () => this.actions.onAirgapOpen?.());
    $('#dock-keeper').addEventListener('click', () => this.actions.onKeeperOpen?.());
    $('#dock-scan').addEventListener('click', () => this.actions.onModeChange?.('scan'));

    $('#sd-toggle').addEventListener('click', () => this.actions.onSdToggle?.());
    $('#sd-import').addEventListener('click', () => this.actions.onSdImport?.());
    $('#sd-clear').addEventListener('click', () => this.actions.onSdClear?.());
    $('#demo-load').addEventListener('click', () => this.actions.onDemoLoad?.($('#demo-network').value));
    $('#qr-create').addEventListener('click', () => this.actions.onQrCreate?.($('#qr-custom').value));
    $('#qr-send').addEventListener('click', () => this.actions.onQrSend?.($('#qr-custom').value));
    $('#airgap-open').addEventListener('click', () => this.actions.onAirgapOpen?.());
    $('#usb-connect').addEventListener('click', () => this.actions.onUsbConnect?.($('#usb-url').value));
    $('#btn-restart').addEventListener('click', () => this.actions.onRestart?.());
    $('#btn-factory').addEventListener('click', () => this.actions.onFactoryReset?.());
    $('#btn-power').addEventListener('click', () => this.actions.onPowerToggle?.());
    $('#scan-cancel').addEventListener('click', () => this.actions.onScanCancel?.());
    $('#scan-auto').addEventListener('click', () => this.actions.onScanAuto?.());

    $('#sd-files').addEventListener('click', event => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      const name = btn.dataset.name;
      if (btn.dataset.action === 'export') this.actions.onSdExport?.(name);
      if (btn.dataset.action === 'delete') this.actions.onSdDelete?.(name);
    });

    window.addEventListener('keydown', event => {
      if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        this.actions.onPowerToggle?.();
      }
      if (event.code === 'KeyH' && !event.metaKey && !event.ctrlKey) this.openHelp();
      if (event.code === 'Escape') {
        if (!$('#help').hidden) this.closeHelp();
        else if (this.panelOpen) this.closeWorkbench();
      }
    });
  }

  toggleWorkbench() {
    if (this.panelOpen) this.closeWorkbench(); else this.openWorkbench();
  }

  openWorkbench(tab) {
    this.panelOpen = true;
    this.workbench.classList.add('open');
    this.workbench.setAttribute('aria-hidden', 'false');
    if (tab) this.selectTab(tab);
  }

  closeWorkbench() {
    this.panelOpen = false;
    this.workbench.classList.remove('open');
    this.workbench.setAttribute('aria-hidden', 'true');
  }

  selectTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
  }

  setPower(on) {
    const chip = $('#chip-power');
    chip.dataset.state = on ? 'on' : 'off';
    chip.querySelector('b').textContent = on ? 'ON' : 'OFF';
    $('#btn-power').textContent = on ? 'Power off' : 'Power on';
    $('#fw-mode').textContent = on ? 'running' : 'off';
  }

  setSD(inserted, files = [], usedBytes = 0, capacityBytes = 8_000_000_000) {
    const chip = $('#chip-sd');
    chip.dataset.state = inserted ? 'in' : 'out';
    chip.querySelector('b').textContent = inserted ? 'IN' : 'OUT';
    $('#sd-toggle').textContent = inserted ? 'Auswerfen' : 'Einsetzen';
    $('#sd-stage').classList.toggle('inserted', inserted);
    $('#sd-hint').textContent = inserted
      ? 'Karte in den Slot ziehen oder hier auswerfen.'
      : 'Karte aus dem Tray in den Slot ziehen oder hier einsetzen.';
    $('#sd-meta').textContent = `${formatBytes(usedBytes)} / ${formatBytes(capacityBytes)}`;
    const pct = Math.max(0.4, Math.min(100, (usedBytes / capacityBytes) * 100));
    $('#sd-bar').style.width = `${pct}%`;
    this.renderSdFiles(files);
  }

  renderSdFiles(files) {
    const list = $('#sd-files');
    if (!files?.length) {
      list.innerHTML = '<li class="empty">Keine Dateien</li>';
      return;
    }
    list.innerHTML = files
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(f => `<li>
        <span class="file-name">${escapeHtml(f.path)}</span>
        <span class="file-size">${formatBytes(f.size)}</span>
        <span class="file-actions">
          <button data-action="export" data-name="${escapeHtml(f.path)}" title="Herunterladen">↓</button>
          <button data-action="delete" data-name="${escapeHtml(f.path)}" title="Löschen">×</button>
        </span>
      </li>`).join('');
  }

  setCards(active, slots = []) {
    const chip = $('#chip-card');
    chip.dataset.state = active ? 'in' : 'out';
    chip.querySelector('b').textContent = active ? `SLOT ${active}` : 'OUT';
    const tray = $('#card-slots');
    tray.innerHTML = slots.map(({ slot, initialized }) => `<button class="card-slot ${active === slot ? 'active' : ''}" data-slot="${slot}">
      <span class="chip-art"></span>
      <strong>MemoryCard ${slot}</strong>
      <small>${active === slot ? 'eingesetzt' : initialized ? 'initialisiert' : 'leer'}</small>
    </button>`).join('');
    tray.querySelectorAll('.card-slot').forEach(btn => {
      const slot = Number(btn.dataset.slot);
      btn.addEventListener('click', () => this.actions.onCardToggle?.(slot));
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (confirm(`MemoryCard ${slot} zurücksetzen? Keys und PIN werden gelöscht.`)) this.actions.onCardReset?.(slot);
      });
    });
  }

  setScanner(active) {
    const chip = $('#chip-scan');
    chip.dataset.state = active ? 'scan' : 'idle';
    chip.querySelector('b').textContent = active ? 'ACTIVE' : 'IDLE';
    $('#dock-scan').disabled = !active;
    $('#scan-hud').hidden = !active;
    if (active) $('#dock-scan').classList.add('active');
    else $('#dock-scan').classList.remove('active');
  }

  setMode(mode) {
    $$('.dock-btn[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    const titles = { hand: 'HAND-HOLD', desk: 'DESK MODE', scan: 'SCANNER POV' };
    $('#scene-title').textContent = titles[mode] || mode.toUpperCase();
    const subs = {
      hand: 'drag the device to inspect it · click the screen to use Specter',
      desk: 'device on the stand · touchscreen and slots fully accessible',
      scan: 'move a QR card into the frame · jsQR reads the rendered camera',
    };
    $('#scene-sub').textContent = subs[mode] || '';
  }

  setScanStatus(text) { $('#scan-status').textContent = text; }
  setScanPayload(text) {
    const el = $('#scan-payload');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = truncate(text, 220);
  }

  setFirmware(info) {
    if (!info) return;
    $('#fw-version').textContent = info.firmware_version || '1.10.5';
    $('#fw-commit').textContent = (info.commit || '').slice(0, 12) || '—';
  }

  log(message) {
    const el = $('#log');
    const line = `${new Date().toLocaleTimeString()}  ${message}`;
    el.textContent = (line + '\n' + el.textContent).slice(0, 6000);
  }

  toast(message, type = 'info', ms = 3400) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      el.style.transition = 'all .25s';
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  tooltip(text, x, y) {
    const el = $('#tooltip');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  hideOnboarding() {
    $('#onboarding').classList.add('hide');
  }

  openHelp() { $('#help').hidden = false; }
  closeHelp() { $('#help').hidden = true; }

  renderQrLibrary(items) {
    const lib = $('#qr-library');
    lib.innerHTML = '';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'qr-item';
      btn.title = 'QR-Karte in der Szene zeigen';
      const canvas = qrCanvas(item.payload, 220, item.payload.length > 700 ? 'L' : 'M');
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      btn.appendChild(canvas);
      const strong = document.createElement('strong');
      strong.textContent = item.label;
      const small = document.createElement('small');
      small.textContent = item.kind || 'QR';
      btn.append(strong, small);
      btn.addEventListener('click', () => this.actions.onQrPick?.(item));
      lib.appendChild(btn);
    });
  }

  setUsbConnected(connected, url = '') {
    const btn = $('#usb-connect');
    btn.textContent = connected ? 'Trennen' : 'Verbinden';
    btn.classList.toggle('ghost', connected);
    if (connected) this.toast(`USB-Brücke verbunden: ${url}`, 'ok');
  }
}
