import React, { useCallback, useState } from 'react';
import random from 'math-random';

import ImageBitmapDecoder from '../util/ImageBitmapDecoder.js';

const Main = () => {
  const [[width, height], setDimension] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [numFramesProcessed, setNumFramesProcessed] = useState(0);

  const handleChange = useCallback(
    async ({ target: { files } }) => {
      const decoder = new ImageBitmapDecoder();

      try {
        const firstImage = await decoder.decode(files[0]);

        setDimension([firstImage.width, firstImage.height]);
      } finally {
        decoder.close();
      }

      setFiles([...files].sort(({ name: x }, { name: y }) => (x > y ? 1 : x < y ? -1 : 0)));
    },
    [setDimension, setFiles]
  );

  const handleStart = useCallback(async () => {
    if (!files.length) {
      return;
    }

    const fileHandle = await window.showSaveFilePicker({
      suggestedName: `timelapse-${random().toString(36).substr(2, 7)}.mp4`,
      types: [
        {
          accept: { 'video/mp4': ['.mp4'] }
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

    recorder.addEventListener('dataavailable', async ({ data }) => {
      await writable.write({ type: 'write', data });
    });

    recorder.addEventListener('stop', async () => {
      await writable.close();

      setBusy(false);
    });

    recorder.start();

    const decoder = new ImageBitmapDecoder();

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];

        context.drawImage(await decoder.decode(file), 0, 0);
        track.requestFrame();

        setNumFramesProcessed(index + 1);
      }
    } finally {
      decoder.close();
    }

    recorder.stop();
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
