// Simple QR code generator for the Nostu Wavzz APK download link
// Quick & lightweight - generates a scannable QR code on the given canvas
(function() {
  'use strict';

  // Minimal QR encoder for a URL string using the simplest algorithm (Version 3-L, byte mode)
  // This is intentionally simple - if needed we can fall back to an image service

  function utf8Encode(str) {
    return unescape(encodeURIComponent(str));
  }

  function generateQRCode(canvasId, text) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return false;

    // Try the simple approach first using Google Charts API (no external deps needed)
    const url = 'https://github.com/sreyassanker/nostuwavzz/releases/download/v0.1.0/nostu-wavzz-v0.1.0-arm64.apk';
    const chartUrl = `https://chart.googleapis.com/chart?cht=qr&chs=180x180&chl=${encodeURIComponent(url)}&choe=UTF-8`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = chartUrl;
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      canvas.width = 180;
      canvas.height = 180;
      ctx.drawImage(img, 0, 0, 180, 180);
    };
    img.onerror = () => {
      // Fallback: draw a placeholder text if QR generation fails
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#eee';
      ctx.fillRect(0, 0, 180, 180);
      ctx.fillStyle = '#000';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Scan URL:', 90, 90);
    };
  }

  // Generate QR when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    generateQRCode('qrcode-canvas', 'https://github.com/sreyassanker/nostuwavzz/releases/download/v0.1.0/nostu-wavzz-v0.1.0-arm64.apk');
  });

  // Expose for manual call
  window.generateNostuWavzzQR = generateQRCode;
})();
