import { READY_STATE_BUSY, READY_STATE_IDLE } from './types/MuxerReadyState';
import createAsyncQueue from './util/createAsyncQueue';

import type { DecodeWorker } from './types/DecodeWorker';
import type { Muxer } from './types/Muxer';
import type { ReadyState } from './types/MuxerReadyState';

export default class CanvasMuxer extends EventTarget implements Muxer {
  #numBytesWritten: number = 0;
  #numFlushes: number = 0;
  #numFramesProcessed: number = 0;
  #readyState: ReadyState = READY_STATE_IDLE;

  get numBytesWritten() {
    return this.#numBytesWritten;
  }

  get numFlushes() {
    return this.#numFlushes;
  }

  get numFramesProcessed() {
    return this.#numFramesProcessed;
  }

  get readyState() {
    return this.#readyState;
  }

  async start(
    sortedFiles: File[],
    fileHandle: FileSystemFileHandle,
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ) {
    if (this.#readyState) {
      return;
    }

    this.#numBytesWritten = 0;
    this.#numFlushes = 0;
    this.#numFramesProcessed = 0;
    this.#readyState = READY_STATE_BUSY;

    this.dispatchEvent(new Event('start'));

    (async () => {
      const writable = await fileHandle.createWritable();

      canvas.height = height;
      canvas.width = width;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get 2D context.');
      }

      const stream = canvas.captureStream(0);
      const [track] = stream.getVideoTracks() as [CanvasCaptureMediaStreamTrack];
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=h264',
        videoBitsPerSecond: 20_000_000
      });

      const worker = new Worker('./static/js/worker.js') as DecodeWorker;

      // Serializes all async calls so we don't put too much stress on the writable.
      // Observable is almost great for this job, but it is not waiting on the next() function.
      const asyncQueue = createAsyncQueue<
        | ['dataavailable', Blob]
        | ['decode error', [Error, string]]
        | ['decoded', [ImageBitmap, string]]
        | ['record error', DOMException]
        | ['stop']
      >();

      recorder.addEventListener('error', event => asyncQueue.push(['record error', (event as any).error]));
      recorder.addEventListener('dataavailable', ({ data }) => asyncQueue.push(['dataavailable', data]));
      recorder.addEventListener('stop', () => asyncQueue.push(['stop']));

      worker.addEventListener('message', ({ data }) => {
        // We have to destruct it here instead of in function arguments because TypeScript does not narrow.
        const [type, payload, name] = data;

        if (type === 'decoded') {
          asyncQueue.push([type, [payload, name]]);
        } else if (type === 'decode error') {
          asyncQueue.push([type, [new Error(payload), name]]);
        }
      });

      let index = 0;
      const pendingFiles = [...sortedFiles];

      recorder.start();
      worker.postMessage(['decode', pendingFiles.shift()]);

      for await (const item of asyncQueue) {
        if (!item) {
          break;
        }

        const [type, payload] = item;

        if (type === 'dataavailable') {
          await writable.write({ type: 'write', data: payload });

          this.#numBytesWritten += payload.size;
          this.#numFlushes++;

          this.dispatchEvent(new Event('progress'));
        } else if (type === 'stop') {
          await writable.close();

          this.#readyState = READY_STATE_IDLE;
          this.dispatchEvent(new Event('end'));

          asyncQueue.close();
        } else if (type === 'decoded') {
          const [imageBitmap, name] = payload;

          if (imageBitmap.height !== height || imageBitmap.width !== width) {
            recorder.stop();

            this.dispatchEvent(
              new ErrorEvent('error', {
                message: `Failed to draw snapshot "${name}".\n\nResolution is ${imageBitmap.width} × ${imageBitmap.height}, expected ${width} × ${height}.`
              })
            );
          } else {
            context.drawImage(imageBitmap, 0, 0);
            track.requestFrame();

            this.#numFramesProcessed++;
            this.dispatchEvent(new Event('progress'));

            const blob = pendingFiles.shift();

            if (blob) {
              worker.postMessage(['decode', blob]);
            } else {
              recorder.stop();
            }
          }
        } else if (type === 'decode error') {
          recorder.stop();

          this.dispatchEvent(
            new ErrorEvent('error', {
              message: `Failed to decode "${payload[1]}", aborting.\n\n${payload[0]}`
            })
          );
        } else if (type === 'record error') {
          this.dispatchEvent(
            new ErrorEvent('error', {
              message: 'Failed to record, aborting.'
            })
          );
        }
      }
    })();
  }
}
