import bytes from 'bytes';
import React, {
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import random from 'math-random';

import MediaRecorderMuxer from '../MediaRecorderMuxer.js';
import WebCodecsMuxer from '../WebCodecsMuxer.js';

declare global {
  interface Window {
    showSaveFilePicker(options: {
      excludeAcceptAllOption?: boolean;
      suggestedName?: string;
      types: {
        description?: string;
        accept: Record<string, string[]>;
      }[];
    }): Promise<FileSystemFileHandle>;
  }
}

type SUPPORTED_BIT_RATE = '1000000' | '5000000' | '20000000' | '100000000';
type SUPPORTED_CODEC = 'h264-mr' | 'h264-wc' | 'vp9';
type SUPPORTED_FRAME_RATE = '29.97' | '60' | '120';
type SUPPORTED_SORTED_BY = 'filename' | 'date';

const BYTES_OPTIONS = { unitSeparator: ' ' };
const PERFORMANCE_WINDOW_SIZE = 30;

const Main = () => {
  const [[width, height], setDimension] = useState<[number, number]>([0, 0]);
  const [bitRate, setBitRate] = useState<SUPPORTED_BIT_RATE>('20000000');
  const [codec, setCodec] = useState<SUPPORTED_CODEC>('h264-wc');
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [frameRate, setFrameRate] = useState<SUPPORTED_FRAME_RATE>('29.97');
  const [savedFilename, setSavedFilename] = useState<string>('');
  const [sortedBy, setSortedBy] = useState<string>('filename');
  const [startTime, setStartTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastProgressRef = useRef(0);
  const muxer = useMemo(
    () =>
      codec === 'h264-mr'
        ? new MediaRecorderMuxer({ bitRate: +bitRate })
        : codec === 'h264-wc'
        ? new WebCodecsMuxer({ bitRate: +bitRate, codec: 'h264', frameRate: +frameRate })
        : new WebCodecsMuxer({ bitRate: +bitRate, codec: 'vp9', frameRate: +frameRate }),
    [bitRate, codec, frameRate]
  );
  const performanceWindowRef = useRef<number[]>([]);

  const imageMuxerSubscribe = useCallback<(onStoreChange: () => void) => () => void>(
    callback => {
      muxer.addEventListener('start', callback);
      muxer.addEventListener('end', callback);
      muxer.addEventListener('progress', callback);

      return () => {
        muxer.removeEventListener('start', callback);
        muxer.removeEventListener('end', callback);
        muxer.removeEventListener('progress', callback);
      };
    },
    [muxer]
  );

  useEffect(() => {
    const handleError: EventListener = event => alert((event as ErrorEvent).message);

    muxer.addEventListener('error', handleError);

    return () => muxer.removeEventListener('error', handleError);
  }, [muxer]);

  const numBytesWritten = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => muxer.numBytesWritten, [muxer])
  );

  const numFlushes = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => muxer.numFlushes, [muxer])
  );

  const numFramesProcessed = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => muxer.numFramesProcessed, [muxer])
  );

  const readyState = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => muxer.readyState, [muxer])
  );

  const numBytesOriginal = useMemo(() => {
    let nextNumBytesOriginal = 0;

    for (let file of files.values()) {
      nextNumBytesOriginal += file.size;
    }

    return nextNumBytesOriginal;
  }, [files]);

  useMemo(() => {
    const now = Date.now();
    const { current: lastProgress } = lastProgressRef;

    if (lastProgress) {
      const { current: performanceWindow } = performanceWindowRef;

      performanceWindow.push(now - lastProgress);
      performanceWindow.splice(0, performanceWindow.length - PERFORMANCE_WINDOW_SIZE);
    }

    lastProgressRef.current = now;
  }, [numFramesProcessed]);

  const sortedFiles = useMemo(
    () =>
      sortedBy === 'filename'
        ? Array.from(files.values()).sort(({ name: x }, { name: y }) => (x > y ? 1 : x < y ? -1 : 0))
        : Array.from(files.values()).sort((x, y) => {
            if (x.lastModified > y.lastModified) {
              return 1;
            } else if (x.lastModified < y.lastModified) {
              return -1;
            } else if (x.name > y.name) {
              return 1;
            } else if (x.name < y.name) {
              return -1;
            }

            return 0;
          }),
    [files, sortedBy]
  );

  const groupedFiles = useMemo<File[][]>(() => {
    let lastCounter: number = -Infinity;
    let lastGroup: File[] = [];
    let nextGroupedFiles: File[][] = [];

    for (const file of sortedFiles) {
      const counter = /^DSC(\d+)\.JPE?G$/u.exec(file.name)?.[1];

      if (counter) {
        const counterNumber = +counter;

        if (counterNumber !== lastCounter + 1) {
          lastGroup = [];
          nextGroupedFiles.push(lastGroup);
        }

        lastCounter = counterNumber;
      }

      lastGroup.push(file);
    }

    return nextGroupedFiles;
  }, [sortedFiles]);

  const handleChange = useCallback<FormEventHandler<HTMLInputElement>>(
    async ({ currentTarget: { files } }) => {
      if (!files?.length) {
        return;
      }

      const firstImageBitmap = await createImageBitmap(files[0]);

      setDimension([firstImageBitmap.width, firstImageBitmap.height]);
      setFiles(existingFiles => {
        const nextFiles = new Map(existingFiles);

        for (const file of Array.from(files)) {
          nextFiles.set(`${file.name}|${file.lastModified}`, file);
        }

        return nextFiles;
      });
    },
    [setDimension, setFiles]
  );

  const handleBitrateChange = useCallback<FormEventHandler<HTMLInputElement>>(
    ({ currentTarget: { value } }) => setBitRate(value as SUPPORTED_BIT_RATE),
    [setBitRate]
  );

  const handleCodecChange = useCallback<FormEventHandler<HTMLInputElement>>(
    ({ currentTarget: { value } }) => setCodec(value as SUPPORTED_CODEC),
    [setCodec, setFrameRate]
  );

  const handleClearAllFilesClick = useCallback(() => setFiles(new Map()), [setFiles]);

  const handleFrameRateChange = useCallback<FormEventHandler<HTMLInputElement>>(
    ({ currentTarget: { value } }) => setFrameRate(value as SUPPORTED_FRAME_RATE),
    [setFrameRate]
  );

  const handleSortedByChange = useCallback<FormEventHandler<HTMLInputElement>>(
    ({ currentTarget: { value } }) => setSortedBy(value as SUPPORTED_SORTED_BY),
    [setSortedBy]
  );

  const handleStart = useCallback(async () => {
    if (!sortedFiles.length) {
      return;
    }

    const { current: canvas } = canvasRef;

    if (!canvas) {
      return;
    }

    const fileHandle = await window.showSaveFilePicker({
      suggestedName: `timelapse-${random().toString(36).substr(2, 7)}-${codec}.${codec === 'h264-wc' ? 'mp4' : 'webm'}`,
      types: [
        {
          accept: { 'video/webm': ['.webm'] }
        }
      ]
    });

    if (!fileHandle) {
      return;
    }

    setSavedFilename(fileHandle.name);
    setStartTime(Date.now());
    lastProgressRef.current = 0;
    performanceWindowRef.current = [];

    muxer.start(sortedFiles, fileHandle, canvas, width, height);
  }, [height, muxer, setStartTime, sortedFiles, width]);

  const { size: numFiles } = files;
  const busy = !!readyState;
  const timeToProcessInMilliseconds =
    performanceWindowRef.current.reduce((total, duration) => total + duration, 0) / performanceWindowRef.current.length;
  const millsecondsElapsed = Date.now() - startTime;
  const started = !!startTime;
  const timelapseDuration = numFiles / +frameRate;
  const currentBitRate = (numBytesWritten * 8) / (numFramesProcessed / +frameRate);

  return (
    <main>
      <h1>Build-a-timelapse</h1>
      <p>
        Build a timelapse video from multiple photos within your browser locally. Your photos will not be uploaded
        anywhere.
      </p>
      <hr />
      <p>Notes:</p>
      <ul>
        <li>Photos will be sorted by their file names</li>
        <li>Multiple batches of photos can be added to a single timelapse</li>
        <li>Video size will be based on the size of the first photo</li>
        <li>
          Video will be encoded at {+bitRate / 1000_000} Mbps using{' '}
          {codec === 'h264-mr' || codec === 'h264-wc' ? 'h.264' : 'VP9'} in {codec === 'h264-wc' ? 'MP4' : 'WebM'}{' '}
          container at {frameRate} FPS
        </li>
        <li>MediaRecorder codecs are not recommend, they yield worse quality</li>
      </ul>
      <p>
        Codec:{' '}
        <label>
          <input checked={codec === 'h264-mr'} onChange={handleCodecChange} type="radio" value="h264-mr" />
          h.264 (MediaRecorder)
        </label>
        <label>
          <input checked={codec === 'h264-wc'} onChange={handleCodecChange} type="radio" value="h264-wc" />
          h.264 (WebCodecs)
        </label>
        <label>
          <input checked={codec === 'vp9'} onChange={handleCodecChange} type="radio" value="vp9" />
          VP9
        </label>
      </p>
      <p>
        Bit rate:{' '}
        <label>
          <input checked={bitRate === '1000000'} onChange={handleBitrateChange} type="radio" value="1000000" />1 Mbps
        </label>
        <label>
          <input checked={bitRate === '5000000'} onChange={handleBitrateChange} type="radio" value="5000000" />5 Mbps
        </label>
        <label>
          <input checked={bitRate === '20000000'} onChange={handleBitrateChange} type="radio" value="20000000" />
          20 Mbps
        </label>
        <label>
          <input checked={bitRate === '100000000'} onChange={handleBitrateChange} type="radio" value="100000000" />
          100 Mbps
        </label>
      </p>
      <p>
        Frame rate:{' '}
        <label>
          <input
            checked={codec === 'h264-mr' || frameRate === '29.97'}
            disabled={codec === 'h264-mr'}
            onChange={handleFrameRateChange}
            type="radio"
            value="29.97"
          />
          29.97
        </label>
        <label>
          <input
            checked={codec !== 'h264-mr' && frameRate === '60'}
            disabled={codec === 'h264-mr'}
            onChange={handleFrameRateChange}
            type="radio"
            value="60"
          />
          60
        </label>
        <label>
          <input
            checked={codec !== 'h264-mr' && frameRate === '120'}
            disabled={codec === 'h264-mr'}
            onChange={handleFrameRateChange}
            type="radio"
            value="120"
          />
          120
        </label>
      </p>
      <p>
        Sorted by:{' '}
        <label>
          <input checked={sortedBy === 'filename'} onChange={handleSortedByChange} type="radio" value="filename" />
          Filename
        </label>
        <label>
          <input checked={sortedBy === 'date'} onChange={handleSortedByChange} type="radio" value="date" />
          Last modified
        </label>
      </p>
      <p>
        Add files to process <input accept="image/jpeg" disabled={busy} multiple onChange={handleChange} type="file" />
      </p>
      <dl>
        <dt>Total number of files</dt>
        <dd>
          {numFiles} of total {bytes(numBytesOriginal, BYTES_OPTIONS)}{' '}
          <button onClick={handleClearAllFilesClick} type="button">
            Clear all files
          </button>
        </dd>
        <dt>Dimension</dt>
        <dd>
          {width} &times; {height}
        </dd>
        <dt>Timelapse duration</dt>
        <dd>{timelapseDuration.toFixed(1)} seconds</dd>
        <dt>File size</dt>
        <dd>
          {busy
            ? `${bytes((currentBitRate * timelapseDuration) / 8, BYTES_OPTIONS)} (Estimated)`
            : `${bytes((+bitRate * timelapseDuration) / 8, BYTES_OPTIONS)} (Projected)`}
        </dd>
        <dt>Number of files processed</dt>
        <dd>
          {busy
            ? `${numFramesProcessed}/${numFiles} (${Math.ceil((numFramesProcessed / numFiles) * 100)}%)`
            : started
            ? 'Done'
            : 'Not started'}
        </dd>
        <dt>Bytes written</dt>
        <dd>
          {started
            ? `${bytes(numBytesWritten, BYTES_OPTIONS)} in ${numFlushes} batches (${bytes(
                currentBitRate,
                BYTES_OPTIONS
              )}ps)`
            : 'Not started'}
        </dd>
        <dt>Average time to process a frame (from last {PERFORMANCE_WINDOW_SIZE} frames)</dt>
        <dd>
          {started
            ? `${timeToProcessInMilliseconds.toFixed(1)} ms (${(1000 / timeToProcessInMilliseconds).toFixed(1)} FPS)`
            : 'Not started'}
        </dd>
        <dt>Estimated total time to finish</dt>
        <dd>{started ? `${((timeToProcessInMilliseconds * numFiles) / 1000).toFixed(1)} seconds` : 'Not started'}</dd>
        <dt>Estimated time left</dt>
        <dd>
          {started
            ? `${((timeToProcessInMilliseconds * numFiles - millsecondsElapsed) / 1000).toFixed(1)} seconds`
            : 'Not started'}
        </dd>
      </dl>
      {!!groupedFiles.length && (
        <details>
          <summary>List of all files</summary>
          <ul>
            {groupedFiles.map(files => (
              <li>
                {files.length > 1
                  ? `${files[0].name} - ${files[files.length - 1].name} (${files.length} files)`
                  : files[0].name}
              </li>
            ))}
          </ul>
        </details>
      )}
      <hr />
      <div>
        <button disabled={busy || !numFiles} onClick={handleStart} type="button">
          Build timelapse
        </button>
        {savedFilename && ` Saved as ${savedFilename}`}
      </div>
      <p>
        <canvas className="rendering-canvas" ref={canvasRef} />
      </p>
    </main>
  );
};

export default Main;
