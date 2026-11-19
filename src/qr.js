import * as THREE from 'three';

const ECL = {
  L: () => QRCode.CorrectLevel.L,
  M: () => QRCode.CorrectLevel.M,
  Q: () => QRCode.CorrectLevel.Q,
  H: () => QRCode.CorrectLevel.H,
};

export function qrCanvas(text, size = 512, level = 'M') {
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-99999px';
  holder.style.top = '0';
  document.body.appendChild(holder);
  try {
    new QRCode(holder, {
      text: String(text),
      width: size,
      height: size,
      colorDark: '#090c10',
      colorLight: '#ffffff',
      correctLevel: ECL[level]?.() ?? QRCode.CorrectLevel.M,
    });
    const canvas = holder.querySelector('canvas');
    if (!canvas) throw new Error('QR canvas unavailable');
    return canvas;
  } finally {
    holder.remove();
  }
}

export function qrTexture(text, size = 512, level = 'M') {
  const canvas = qrCanvas(text, size, level);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.userData.payload = String(text);
  texture.userData.qrCanvas = canvas;
  return texture;
}

export function drawQr(ctx, text, x, y, size, level = 'M') {
  const canvas = qrCanvas(text, Math.max(256, Math.round(size * 1.5)), level);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, x, y, size, size);
  ctx.imageSmoothingEnabled = true;
  return canvas;
}

export function decodeCanvas(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = window.jsQR?.(data.data, canvas.width, canvas.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (!result?.binaryData?.length) return null;
  return {
    text: result.data,
    bytes: Uint8Array.from(result.binaryData),
    location: result.location,
  };
}

export function decodePixels(pixels, width, height) {
  const result = window.jsQR?.(pixels, width, height, { inversionAttempts: 'attemptBoth' });
  if (!result?.binaryData?.length) return null;
  return {
    text: result.data,
    bytes: Uint8Array.from(result.binaryData),
    location: result.location,
  };
}

export function makeQrCardTexture(payload, label) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size + 108;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f8fa';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(18, 18, size - 36, size - 36);
  const qr = qrCanvas(payload, size - 72, payload.length > 700 ? 'L' : 'M');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 36, 36, size - 72, size - 72);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#0d1218';
  ctx.font = '700 22px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label.toUpperCase(), 30, size + 38);
  ctx.fillStyle = '#7a8794';
  ctx.font = '400 15px -apple-system, Segoe UI, sans-serif';
  ctx.fillText('SPECTER DIY · TEST DATA', 30, size + 64);
  ctx.strokeStyle = 'rgba(13,18,24,.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, size - 36, size - 36);
  return c;
}
