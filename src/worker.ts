addEventListener('message', async ({ data: { payload, type } }) => {
  switch (type) {
    case 'decode':
      const { id } = payload;

      try {
        const imageBitmap = await createImageBitmap(payload.blob);

        postMessage({ payload: { id, imageBitmap }, type: 'decoded' }, [imageBitmap]);
      } catch ({ message }) {
        postMessage({ payload: { error: message, id }, type: 'decode error' });
      }

      break;
  }
});
