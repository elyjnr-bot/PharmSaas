export async function preprocessImageForOCR(imageData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        console.log('[Preprocessing] Image loaded successfully');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const MAX_WIDTH = 640;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        console.log('[Preprocessing] Increasing contrast');
        imgData = increaseContrast(imgData, 128);

        console.log('[Preprocessing] Detecting if inversion needed');
        const needsInversion = detectIfDarkBackground(imgData);
        if (needsInversion) {
          console.log('[Preprocessing] Inverting colors (dark background detected)');
          imgData = invertColors(imgData);
        }

        console.log('[Preprocessing] Converting to black and white');
        imgData = convertToBlackAndWhite(imgData);

        console.log('[Preprocessing] Sharpening image');
        imgData = sharpenImage(imgData);

        console.log('[Preprocessing] Deskewing image');
        imgData = deskewImage(imgData);

        ctx.putImageData(imgData, 0, 0);

        console.log('[Preprocessing] Complete');
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        console.error('[Preprocessing] Error:', error);
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageData;
  });
}

function detectIfDarkBackground(imageData: ImageData): boolean {
  const data = imageData.data;
  let totalBrightness = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    totalBrightness += brightness;
    count++;
  }

  const avgBrightness = totalBrightness / count;
  return avgBrightness < 128;
}

function invertColors(imageData: ImageData): ImageData {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }

  return imageData;
}

function convertToBlackAndWhite(imageData: ImageData): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  let total = width * height;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, wF = 0, max = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = i;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
  }

  return imageData;
}

function sharpenImage(imageData: ImageData): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const output = new ImageData(width, height);

  const kernel = [
    0, -1,  0,
   -1,  5, -1,
    0, -1,  0
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            sum += data[idx] * kernel[kernelIdx];
          }
        }
        const outIdx = (y * width + x) * 4 + c;
        output.data[outIdx] = Math.max(0, Math.min(255, sum));
      }
      const outIdx = (y * width + x) * 4 + 3;
      output.data[outIdx] = 255;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const y = Math.floor(i / 4 / width);
    const x = (i / 4) % width;
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
      output.data[i] = data[i];
      output.data[i + 1] = data[i + 1];
      output.data[i + 2] = data[i + 2];
      output.data[i + 3] = 255;
    }
  }

  return output;
}

function increaseContrast(imageData: ImageData, amount: number): ImageData {
  const data = imageData.data;
  const factor = (259 * (amount + 255)) / (255 * (259 - amount));

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
    data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
    data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
  }

  return imageData;
}

function deskewImage(imageData: ImageData): ImageData {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageData;

  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);

  const angle = detectSkewAngle(imageData);

  if (Math.abs(angle) > 0.5) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return imageData;

    const diagonal = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);
    tempCanvas.width = diagonal;
    tempCanvas.height = diagonal;

    tempCtx.translate(diagonal / 2, diagonal / 2);
    tempCtx.rotate((-angle * Math.PI) / 180);
    tempCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      tempCanvas,
      (diagonal - canvas.width) / 2,
      (diagonal - canvas.height) / 2,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function detectSkewAngle(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  const edges: { x: number; y: number }[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      const nextIdx = (y * width + (x + 1)) * 4;
      const nextGray = (data[nextIdx] + data[nextIdx + 1] + data[nextIdx + 2]) / 3;

      if (Math.abs(gray - nextGray) > 50) {
        edges.push({ x, y });
      }
    }
  }

  if (edges.length < 10) return 0;

  let sumAngle = 0;
  let count = 0;

  for (let i = 0; i < Math.min(edges.length - 1, 100); i++) {
    const p1 = edges[i];
    const p2 = edges[i + 1];

    if (Math.abs(p2.x - p1.x) > 5) {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
      if (Math.abs(angle) < 15) {
        sumAngle += angle;
        count++;
      }
    }
  }

  return count > 0 ? sumAngle / count : 0;
}
