type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: any) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  const deferred: Partial<Deferred<T>> = {};

  deferred.promise = new Promise((resolve, reject) => {
    deferred.reject = reject;
    deferred.resolve = resolve;
  });

  return deferred as Deferred<T>;
}

const CLOSE = Symbol('close');

export default function createAsyncQueue<T>() {
  const queue: (typeof CLOSE | T)[] = [];
  let deferred = createDeferred<void>();

  return {
    close() {
      queue.push(CLOSE);
    },
    push(value: T) {
      queue.push(value);
      deferred.resolve();
      deferred = createDeferred();
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length) {
          const value = queue.shift();

          if (value === CLOSE) {
            return;
          }

          yield value;
        }

        await deferred.promise;
      }
    }
  };
}
