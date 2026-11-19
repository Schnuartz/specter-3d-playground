import * as THREE from 'three';

export class ScreenTexture {
  constructor(width = 480, height = 800) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);
    this.imageData = this.ctx.createImageData(width, height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.frameCount = 0;
    this.lastFrameAt = 0;
  }

  drawFrame(pixels) {
    if (!pixels || pixels.length !== this.width * this.height * 4) return;
    const out = this.imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      out[i] = pixels[i + 2];
      out[i + 1] = pixels[i + 1];
      out[i + 2] = pixels[i];
      out[i + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.needsUpdate = true;
    this.frameCount++;
    this.lastFrameAt = performance.now();
  }

  drawBoot() {
    const { ctx, width, height } = this;
    const g = ctx.createRadialGradient(width / 2, height * 0.42, 20, width / 2, height * 0.42, width * 0.9);
    g.addColorStop(0, '#0b2032');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(31,153,229,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.42, 78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,248,252,.85)';
    ctx.font = '700 22px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECTER DIY', width / 2, height * 0.42 + 8);
    ctx.fillStyle = 'rgba(101,199,255,.65)';
    ctx.font = '600 10px -apple-system, Segoe UI, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('BOOTING FIRMWARE', width / 2, height * 0.42 + 42);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(width / 2 - 90, height * 0.42 + 62, 180, 3);
    const t = performance.now();
    const p = (Math.sin(t / 280) + 1) / 2;
    ctx.fillStyle = 'rgba(31,153,229,.8)';
    ctx.fillRect(width / 2 - 90 + p * 130, height * 0.42 + 62, 50, 3);
    this.texture.needsUpdate = true;
  }

  drawBlack() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.texture.needsUpdate = true;
  }

  snapshotCanvas() {
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    c.getContext('2d').drawImage(this.canvas, 0, 0);
    return c;
  }

  dispose() {
    this.texture.dispose();
  }
}

ScreenTexture.prototype.drawMessage = function drawMessage(title, subtitle) {
  const { ctx, width, height } = this;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const g = ctx.createRadialGradient(width / 2, height * 0.44, 20, width / 2, height * 0.44, width);
  g.addColorStop(0, '#0a1d2c');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f4f8fc';
  ctx.font = '700 26px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, height * 0.44);
  ctx.fillStyle = 'rgba(101,199,255,.7)';
  ctx.font = '500 15px -apple-system, Segoe UI, sans-serif';
  ctx.fillText(subtitle, width / 2, height * 0.44 + 34);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fillRect(width / 2 - 90, height * 0.44 + 60, 180, 2);
  this.texture.needsUpdate = true;
};
