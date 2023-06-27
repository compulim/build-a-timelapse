addEventListener('message', async ({ data: [type, blob] }) => {
  switch (type) {
    case 'decode':
      try {
        const imageBitmap = await createImageBitmap(blob);

        postMessage(['decoded', imageBitmap], [imageBitmap]);
      } catch (error) {
        postMessage(['decode error', (error as any)?.message]);
      }

      break;
  }
});
