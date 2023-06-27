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

import ImageMuxer from '../ImageMuxer.js';

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

const Main = () => {
  const [[width, height], setDimension] = useState<[number, number]>([0, 0]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageMuxer = useMemo(() => new ImageMuxer(), []);

  const imageMuxerSubscribe = useCallback<(onStoreChange: () => void) => () => void>(
    callback => {
      imageMuxer.addEventListener('start', callback);
      imageMuxer.addEventListener('end', callback);
      imageMuxer.addEventListener('progress', callback);

      return () => {
        imageMuxer.removeEventListener('start', callback);
        imageMuxer.removeEventListener('end', callback);
        imageMuxer.removeEventListener('progress', callback);
      };
    },
    [imageMuxer]
  );

  useEffect(() => {
    const handleError: EventListener = event => alert((event as ErrorEvent).message);

    imageMuxer.addEventListener('error', handleError);

    return () => imageMuxer.removeEventListener('error', handleError);
  }, [imageMuxer]);

  const numBytesWritten = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => imageMuxer.numBytesWritten, [imageMuxer])
  );

  const numFlushes = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => imageMuxer.numFlushes, [imageMuxer])
  );

  const numFramesProcessed = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => imageMuxer.numFramesProcessed, [imageMuxer])
  );

  const readyState = useSyncExternalStore(
    imageMuxerSubscribe,
    useCallback(() => imageMuxer.readyState, [imageMuxer])
  );

  const numBytesOriginal = useMemo(() => {
    let nextNumBytesOriginal = 0;

    for (let file of files.values()) {
      nextNumBytesOriginal += file.size;
    }

    return nextNumBytesOriginal;
  }, [files]);

  const sortedFiles = useMemo(
    () => Array.from(files.values()).sort(({ name: x }, { name: y }) => (x > y ? 1 : x < y ? -1 : 0)),
    [files]
  );

  const groupedFiles = useMemo(() => {
    let lastCounter: number = -Infinity;
    let lastGroup: File[] = [];
    let nextGroupedFiles: File[][] = [];

    for (const file of sortedFiles) {
      const counter = /^DSC(\d+)\.JPE?G$/.exec(file.name)?.[1];

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
          nextFiles.set(file.name, file);
        }

        return nextFiles;
      });
    },
    [setDimension, setFiles]
  );

  const handleClearAllFilesClick = useCallback(() => setFiles(new Map()), [setFiles]);

  const handleStart = useCallback(async () => {
    if (!sortedFiles.length) {
      return;
    }

    const { current: canvas } = canvasRef;

    if (!canvas) {
      return;
    }

    const fileHandle = await window.showSaveFilePicker({
      suggestedName: `timelapse-${random().toString(36).substr(2, 7)}.webm`,
      types: [
        {
          accept: { 'video/webm': ['.webm'] }
        }
      ]
    });

    if (!fileHandle) {
      return;
    }

    imageMuxer.start(sortedFiles, fileHandle, canvas, width, height);
  }, [height, imageMuxer, sortedFiles, width]);

  const { size: numFiles } = files;
  const busy = !!readyState;

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
        <li>Video will be encoded at 20 Mbps using h.264 in WebM container at 30 FPS</li>
      </ul>
      <div>
        Add files to process <input accept="image/jpeg" disabled={busy} multiple onChange={handleChange} type="file" />
      </div>
      <dl>
        <dt>Total number of files</dt>
        <dd>
          {numFiles} of total {bytes(numBytesOriginal)}{' '}
          <button onClick={handleClearAllFilesClick} type="button">
            Clear all files
          </button>
        </dd>
        <dt>Dimension</dt>
        <dd>
          {width} &times; {height}
        </dd>
        <dt>Durartion</dt>
        <dd>{(numFiles / 30).toFixed(1)} seconds</dd>
        <dt>Number of files processed</dt>
        <dd>
          {busy ? `${numFramesProcessed}/${numFiles} (${Math.ceil((numFramesProcessed / numFiles) * 100)}%)` : 'Done'}
        </dd>
        <dt>Bytes written</dt>
        <dd>
          {bytes(numBytesWritten)} in {numFlushes} batches
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
      <button disabled={busy || !numFiles} onClick={handleStart} type="button">
        Build timelapse
      </button>
      <p>
        <canvas className="rendering-canvas" ref={canvasRef} />
      </p>
    </main>
  );
};

export default Main;
