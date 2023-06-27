import type { DecodeWorker } from '../types/DecodeWorker';

const worker = new Worker('./static/js/worker.js') as DecodeWorker;

export default function decodeImageAsImageBitmap(file: File): Promise<ImageBitmap> {
  const bitmapPromise: Promise<ImageBitmap> = new Promise((resolve, reject) => {
    worker.addEventListener(
      'message',
      ({ data }) => {
        if (data[0] === 'decoded') {
          resolve(data[1]);
        } else if (data[1] === 'decode error') {
          reject(new Error('Failed to decode image.'));
        }
      },
      { once: true }
    );
  });

  worker.postMessage(['decode', file]);

  return bitmapPromise;
}
