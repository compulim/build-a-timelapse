import type { ReadyState } from './MuxerReadyState';

export interface Muxer {
  get numBytesWritten(): number;
  get numFlushes(): number;
  get numFramesProcessed(): number;
  get readyState(): ReadyState;

  start(
    sortedFiles: File[],
    fileHandle: FileSystemFileHandle,
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void;
}
