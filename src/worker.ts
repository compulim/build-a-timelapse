import type { ResultMessage } from './types/ResultMessage';
import type { WorkMessage } from './types/WorkMessage';

addEventListener('message', async ({ data: [type, file] }: { data: WorkMessage }) => {
  switch (type) {
    case 'decode':
      try {
        const imageBitmap = await createImageBitmap(file);

        postMessage(['decoded', imageBitmap, file.name] as ResultMessage, [imageBitmap]);
      } catch (error) {
        postMessage(['decode error', (error as any)?.message] as ResultMessage);
      }

      break;
  }
});
