import React, { FormEventHandler, useCallback, useMemo, useState } from 'react';
import random from 'math-random';

import createAsyncQueue from '../util/createAsyncQueue.js';

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
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [numFramesProcessed, setNumFramesProcessed] = useState(0);

  const sortedFiles = useMemo(
    () => Array.from(files.values()).sort(({ name: x }, { name: y }) => (x > y ? 1 : x < y ? -1 : 0)),
    [files]
  );

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

  const handleClearAllFilesClick = useCallback(() => {
    setFiles(new Map());
  }, [setFiles]);

  const handleStart = useCallback(async () => {
    if (!sortedFiles.length) {
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

    setBusy(true);

    const canvas = document.createElement('canvas');
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

    const worker = new Worker('./static/js/worker.js');

    // Serializes all async calls so we don't put too much stress on the writable.
    // Observable is almost great for this job, but it is not waiting on the next() function.
    const asyncQueue = createAsyncQueue<
      | ['dataavailable', Blob]
      | ['decode error', Error]
      | ['decoded', ImageBitmap]
      | ['record error', DOMException]
      | ['stop']
    >();

    recorder.addEventListener('error', event => asyncQueue.push(['record error', (event as any).error]));
    recorder.addEventListener('dataavailable', ({ data }) => asyncQueue.push(['dataavailable', data]));
    recorder.addEventListener('stop', () => asyncQueue.push(['stop']));

    worker.addEventListener('message', ({ data: [type, data] }) => {
      if (type === 'decoded') {
        asyncQueue.push([type, data]);
      } else if (type === 'decode error') {
        asyncQueue.push([type, new Error(data)]);
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
      } else if (type === 'stop') {
        await writable.close();
        setBusy(false);

        asyncQueue.close();
      } else if (type === 'decoded') {
        context.drawImage(await payload, 0, 0);
        track.requestFrame();

        setNumFramesProcessed(++index);

        const blob = pendingFiles.shift();

        if (blob) {
          worker.postMessage(['decode', blob]);
        } else {
          recorder.stop();
        }
      } else if (type === 'decode error') {
        recorder.stop();

        alert('Failed to decode image, aborting.');
      } else if (type === 'record error') {
        alert('Failed to record, aborting.');
      }
    }
  }, [height, setBusy, setNumFramesProcessed, sortedFiles, width]);

  const { size: numFiles } = files;

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
          {numFiles}{' '}
          <button onClick={handleClearAllFilesClick} type="button">
            Clear all files
          </button>
        </dd>
        <dt>Dimension</dt>
        <dd>
          {width} &times; {height}
        </dd>
        <dt>Number of files processed</dt>
        <dd>
          {busy ? `${numFramesProcessed}/${numFiles} (${Math.ceil((numFramesProcessed / numFiles) * 100)}%)` : 'Done'}
        </dd>
      </dl>
      <details>
        <summary>List of all files</summary>
        <ul>
          {sortedFiles.map(({ name }) => (
            <li>{name}</li>
          ))}
        </ul>
      </details>
      <hr />
      <button disabled={busy || !numFiles} onClick={handleStart} type="button">
        Build timelapse
      </button>
    </main>
  );
};

export default Main;
