import React, { useCallback, useRef, useState } from 'react';
import random from 'math-random';

import decodeAsImage from '../util/decodeAsImage.js';

const Main = () => {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [[width, height], setDimension] = useState<[number, number]>([0, 0]);
  const [numFramesProcessed, setNumFramesProcessed] = useState(0);
  const writableRef = useRef();

  const handleChange = useCallback(
    async event => {
      setFiles([...event.target.files].sort(({ name: x }, { name: y }) => (x > y ? 1 : x < y ? -1 : 0)));
    },
    [setFiles, writableRef]
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

    const writable = await fileHandle.createWritable();

    const canvas = document.createElement('canvas');

    const [firstFile] = files;

    const firstImage = await decodeAsImage(firstFile);

    canvas.height = firstImage.height;
    canvas.width = firstImage.width;

    setDimension([firstImage.width, firstImage.height]);

    const context = canvas.getContext('2d');
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

    for (let index = 0; index < files.length; index++) {
      const file = files[index];

      context?.drawImage(await decodeAsImage(file), 0, 0);
      track.requestFrame();

      setNumFramesProcessed(index + 1);
    }

    recorder.stop();
  }, [files, setBusy, setDimension, setNumFramesProcessed]);

  return (
    <section role="main">
      <h1>Build a timelapse</h1>
      <input accept="image/jpeg" multiple onChange={handleChange} type="file" />
      <dl>
        <dt>Total number of files</dt>
        <dd>{files.length}</dd>
        <dt>Dimension</dt>
        <dd>
          {width} &times; {height}
        </dd>
        <dt>Number of frames processed</dt>
        <dd>{busy ? `${numFramesProcessed}/${files.length}` : 'Done'}</dd>
      </dl>
      <button disabled={busy || !files.length} onClick={handleStart} type="button">
        Start
      </button>
    </section>
  );
};

export default Main;
