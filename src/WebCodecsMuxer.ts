import { FileSystemWritableFileStreamTarget, Muxer } from 'webm-muxer';

import { READY_STATE_BUSY, READY_STATE_IDLE } from './types/MuxerReadyState';
import decodeImageAsImageBitmap from './util/decodeImageAsImageBitmap';
// import decodeImageAsVideoFrame from './util/decodeImageAsVideoFrame';

import type { Muxer as IMuxer } from './types/Muxer';
import type { ReadyState } from './types/MuxerReadyState';

// It seems HEVC is not enabled in Chrome yet.
// https://github.com/StaZhu/enable-chromium-hevc-hardware-decoding

// QA on how to find/verify ISOBMFF binding:
// https://stackoverflow.com/questions/71878207/what-are-valid-codec-strings-to-be-used-in-the-web-codecs-api

// const MUXER_CONFIG = {
//   codec: 'hevc'
// } as { codec: 'hevc' };

// const VIDEO_ENCODER_CONFIG = {
//   codec: 'hvc1.1.6.L93.B0',
//   // codec: 'hev1.1.6.L120.90',
//   framerate: FRAMERATE
// };

const MUXER_CONFIG = {
  codec: 'V_VP9'
};

const VIDEO_ENCODER_CONFIG = {
  codec: 'vp09.00.10.08'
};

export default class WebCodecsMuxer extends EventTarget implements IMuxer {
  constructor({ bitRate, frameRate }: { bitRate: number; frameRate: number }) {
    super();

    this.#bitRate = bitRate;
    this.#frameRate = frameRate;
  }

  #bitRate: number;
  #frameRate: number;
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

  start(
    sortedFiles: File[],
    fileHandle: FileSystemFileHandle,
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ) {
    if (this.#readyState !== READY_STATE_IDLE) {
      return;
    }

    this.#numBytesWritten = 0;
    this.#numFlushes = 0;
    this.#numFramesProcessed = 0;
    this.#readyState = READY_STATE_BUSY;

    this.dispatchEvent(new Event('start'));

    (async () => {
      try {
        canvas.height = height;
        canvas.width = width;

        const context = canvas.getContext('2d');

        const config: VideoEncoderConfig = {
          ...VIDEO_ENCODER_CONFIG,
          bitrate: this.#bitRate,
          framerate: this.#frameRate,
          height,
          width
        };

        const isSupported = await VideoEncoder.isConfigSupported(config);

        if (!isSupported) {
          return this.dispatchEvent(
            new ErrorEvent('error', { message: 'Video encode configuration is not supported.' })
          );
        }

        const stream = await fileHandle.createWritable();

        try {
          const muxer = new Muxer({
            target: new FileSystemWritableFileStreamTarget(stream),
            video: { ...MUXER_CONFIG, height, width }
          });

          try {
            const videoEncoder = new VideoEncoder({
              error: (error: DOMException) =>
                this.dispatchEvent(
                  new ErrorEvent('error', { message: `Failed to encode to video.\n\n${error.message}` })
                ),
              output: (chunk, meta) => {
                muxer.addVideoChunk(chunk, meta as any);

                this.#numBytesWritten += chunk.byteLength;
                this.#numFlushes++;

                this.dispatchEvent(new Event('progress'));
              }
            });

            try {
              videoEncoder.configure(config);

              for (let file of sortedFiles) {
                const frame = await decodeImageAsImageBitmap(file);

                // The decoded VideoFrame is 4:2:2, which is not supported by VP9 Level 0 (8-bit 4:2:0).
                // Chromium seems does not support VP9 Level 1+.
                // https://en.wikipedia.org/wiki/VP9#Profiles
                // const frame = await decodeImageAsVideoFrame(file);

                try {
                  context?.drawImage?.(frame, 0, 0);

                  const timestampedVideoFrame = new VideoFrame(frame, {
                    timestamp: (this.#numFramesProcessed++ * 1000000) / this.#frameRate
                  });

                  try {
                    videoEncoder.encode(timestampedVideoFrame);

                    await videoEncoder.flush();
                  } finally {
                    timestampedVideoFrame.close();
                  }
                } finally {
                  frame.close();
                }

                this.dispatchEvent(new Event('progress'));
              }
            } finally {
              videoEncoder.close();
            }
          } finally {
            muxer.finalize();
          }
        } finally {
          await stream.close();
        }
      } finally {
        this.#readyState = READY_STATE_IDLE;

        this.dispatchEvent(new Event('end'));
      }
    })();
  }
}
