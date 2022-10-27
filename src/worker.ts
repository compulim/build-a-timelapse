addEventListener('message', async ({ data: [type, blob] }) => {
  switch (type) {
    case 'decode':
      try {
        const imageBitmap = await createImageBitmap(blob);

        postMessage(['decoded', imageBitmap], [imageBitmap]);
      } catch ({ message }) {
        postMessage(['decode error', message]);
      }

      break;
  }
});
