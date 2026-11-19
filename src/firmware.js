import { sleep } from './util.js';

const BUILD = 'builds/cryptoadvance/specter-diy/b9c85b9651d3e4cea2fbc954a8c5558844367c81/';
const VERSION = '0aa7130f94251a0f';
const WORKER_URL = 'runtime/runtime-worker.js';

export class FirmwareRuntime {
  constructor({ onFrame, onMessage, onLog, onStatus } = {}) {
    this.onFrame = onFrame || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onLog = onLog || (() => {});
    this.onStatus = onStatus || (() => {});
    this.worker = null;
    this.blobUrl = null;
    this.pending = new Map();
    this.requestId = 0;
    this.running = false;
    this.snapshotFiles = [];
    this.buildInfo = null;
    this.startedAt = 0;
    this.lastError = null;
  }

  async loadBuildInfo() {
    if (this.buildInfo) return this.buildInfo;
    const res = await fetch(`${BUILD}build-info.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`build-info HTTP ${res.status}`);
    this.buildInfo = await res.json();
    return this.buildInfo;
  }

  async start({ stateFiles = [], sdInserted = false, cardSlot = null, program = 'wallet' } = {}) {
    this.stopWorker();
    this.running = false;
    this.lastError = null;
    const info = await this.loadBuildInfo();
    const version = info.artifact_set_sha256?.slice(0, 16) || VERSION;
    const workerResponse = await fetch(WORKER_URL, { cache: 'no-store' });
    if (!workerResponse.ok) throw new Error(`worker HTTP ${workerResponse.status}`);
    this.blobUrl = URL.createObjectURL(new Blob([await workerResponse.text()], { type: 'text/javascript' }));
    const worker = new Worker(this.blobUrl, { name: 'Specter DIY 3D' });
    this.worker = worker;
    this.startedAt = performance.now();
    const started = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('firmware boot timeout')), 60000);
      this._startResolve = files => { clearTimeout(timeout); resolve(files); };
      this._startReject = err => { clearTimeout(timeout); reject(err); };
    });
    worker.onmessage = event => this._handle(event.data);
    worker.onerror = event => {
      event.preventDefault();
      const err = new Error(event.message || 'worker error');
      this.lastError = err;
      this.onStatus('error', err);
      this._startReject?.(err);
    };
    worker.onmessageerror = () => {
      const err = new Error('worker message deserialization failed');
      this.lastError = err;
      this.onStatus('error', err);
    };
    const build = new URL(BUILD, location.href).href;
    const cleanFiles = stateFiles.map(f => ({
      path: f.path,
      bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes),
    }));
    worker.postMessage({
      type: 'start',
      build,
      version,
      program,
      canvas: null,
      headlessDisplay: true,
      stateFiles: cleanFiles,
      sdInserted,
      cardSlot,
    });
    try {
      await started;
      this.running = true;
      this.onStatus('running');
    } catch (error) {
      this.lastError = error;
      this.onStatus('error', error);
      throw error;
    }
    return this;
  }

  _handle(data) {
    switch (data.type) {
      case 'frame':
        this.onFrame(data.pixels);
        break;
      case 'running':
        this.running = true;
        this.onStatus('running');
        this._startResolve?.(this.snapshotFiles);
        this._startResolve = null;
        break;
      case 'snapshot': {
        const resolve = this.pending.get(data.requestId);
        if (resolve) {
          this.pending.delete(data.requestId);
          resolve(data.files || []);
        }
        break;
      }
      case 'log':
        this.onLog(data.message);
        break;
      case 'debug':
        if (!String(data.message).includes('registerOrRemoveHandler')) this.onLog(data.message);
        break;
      case 'loading-progress':
        this.onStatus('loading', data.remaining);
        break;
      case 'worker-error':
      case 'abort': {
        const err = new Error(data.message || data.type);
        this.lastError = err;
        this.onLog(`FATAL: ${data.message || data.type}`);
        this.onStatus('error', err);
        this._startReject?.(err);
        this._startReject = null;
        break;
      }
      case 'operation-error':
        this.onMessage(data);
        break;
      default:
        this.onMessage(data);
    }
  }

  send(type, data = {}, transfer = []) {
    if (!this.worker) return false;
    this.worker.postMessage({ type, ...data }, transfer);
    return true;
  }

  async snapshot() {
    if (!this.worker) return this.snapshotFiles;
    const id = ++this.requestId;
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve(this.snapshotFiles);
      }, 4000);
      this.pending.set(id, files => {
        clearTimeout(timeout);
        this.snapshotFiles = files;
        resolve(files);
      });
      this.worker.postMessage({ type: 'snapshot', requestId: id });
    });
  }

  stopWorker() {
    if (this.worker) {
      try { this.worker.terminate(); } catch {}
      this.worker = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.running = false;
    this.pending.clear();
  }

  async powerOff() {
    if (!this.worker) return [];
    const files = await this.snapshot();
    await sleep(40);
    this.stopWorker();
    return files;
  }

  async restart({ factory = false } = {}) {
    const files = await this.snapshot();
    let next = files;
    if (factory) {
      next = files.filter(f => f.path.startsWith('sd/') || f.path.startsWith('cards/'));
    }
    const sdInserted = this.lastSdInserted;
    const cardSlot = this.lastCardSlot;
    this.stopWorker();
    await sleep(80);
    return this.start({ stateFiles: next, sdInserted, cardSlot });
  }
}
