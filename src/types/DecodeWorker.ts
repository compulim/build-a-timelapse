import type { ResultMessage } from './ResultMessage';
import type { WorkMessage } from './WorkMessage';

export type DecodeWorker = Worker & {
  addEventListener(
    type: 'message',
    listener: (this: Worker, ev: MessageEvent<ResultMessage>) => any,
    options?: boolean | AddEventListenerOptions
  ): void;

  postMessage(message: WorkMessage): void;
};
