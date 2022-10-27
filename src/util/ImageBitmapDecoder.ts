import uniqueID from './uniqueID';

export default class ImageBitmapDecoder {
  constructor() {
    this.#decodings = new Map();

    this.#worker = new Worker('./static/js/worker.js');
    this.#worker.addEventListener('message', ({ data: { payload, type } }) => {
      if (type === 'decoded') {
        const { id, imageBitmap } = payload;

        this.#decodings.get(id)?.resolve(imageBitmap);
        this.#decodings.delete(id);
      } else if (type === 'decode error') {
        const { error, id } = payload;

        this.#decodings.get(id)?.reject(new Error(error));
        this.#decodings.delete(id);
      }
    });
  }

  #decodings: Map<string, { reject: (error: Error) => void; resolve: (imageBitmap: ImageBitmap) => void }>;
  #worker: Worker;

  async decode(blob: Blob): Promise<ImageBitmap> {
    const id = uniqueID();

    return new Promise((resolve, reject) => {
      this.#decodings.set(id, { reject, resolve });
      this.#worker.postMessage({ payload: { id, blob }, type: 'decode' });
    });
  }
}
