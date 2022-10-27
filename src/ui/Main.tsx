import React, { useCallback, useState } from 'react';
import random from 'math-random';

import createAsyncQueue from '../util/createAsyncQueue.js';

const Main = () => {
  const [[width, height], setDimension] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [numFramesProcessed, setNumFramesProcessed] = useState(0);

  const handleChange = useCallback(
    async ({ target: { files } }) => {
      const firstImageBitmap = await createImageBitmap(files[0]);

      setDimension([firstImageBitmap.width, firstImageBitmap.height]);
      setFiles([...files].sort(({ name: x }, { name: y }) => (x > y ? 1 : x < y ? -1 : 0)));
    },
    [setDimension, setFiles]
  );

  const handleStart = useCallback(async () => {
    if (!files.length) {
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
    const asyncQueue = createAsyncQueue<
      | ['dataavailable', Blob]
      | ['decode error', Error]
      | ['decoded', ImageBitmap]
      | ['record error', DOMException]
      | ['stop']
    >();

    recorder.addEventListener('error', ({ error }) => {
      asyncQueue.push(['record error', error]);
    });

    recorder.addEventListener('dataavailable', ({ data }) => {
      asyncQueue.push(['dataavailable', data]);
    });

    recorder.addEventListener('stop', () => {
      asyncQueue.push(['stop']);
    });

    worker.addEventListener('message', ({ data: [type, data] }) => {
      if (type === 'decoded') {
        asyncQueue.push([type, data]);
      } else if (type === 'decode error') {
        asyncQueue.push([type, new Error(data)]);
      }
    });

    let index = 0;
    const pendingFiles = [...files];

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
  }, [files, height, setBusy, setNumFramesProcessed, width]);

  return (
    <section role="main">
      <h1>Build-a-timelapse</h1>
      <input accept="image/jpeg" disabled={busy} multiple onChange={handleChange} type="file" />
      <dl>
        <dt>Total number of files</dt>
        <dd>{files.length}</dd>
        <dt>Dimension</dt>
        <dd>
          {width} &times; {height}
        </dd>
        <dt>Number of files processed</dt>
        <dd>
          {busy
            ? `${numFramesProcessed}/${files.length} (${Math.ceil((numFramesProcessed / files.length) * 100)}%)`
            : 'Done'}
        </dd>
      </dl>
      <button disabled={busy || !files.length} onClick={handleStart} type="button">
        Start
      </button>
    </section>
  );
};

export default Main;
