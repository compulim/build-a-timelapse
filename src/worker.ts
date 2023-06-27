addEventListener('message', async ({ data: [type, file] }) => {
  switch (type) {
    case 'decode':
      try {
        const imageBitmap = await createImageBitmap(file);

        postMessage(['decoded', imageBitmap, file.name], [imageBitmap]);
      } catch (error) {
        postMessage(['decode error', (error as any)?.message]);
      }

      break;
  }
});
