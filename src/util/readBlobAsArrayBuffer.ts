export default async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('error', () => reject(new Error('Failed to read file.')));

    reader.addEventListener('loadend', () => {
      resolve(reader.result as ArrayBuffer);
    });

    reader.readAsArrayBuffer(blob);
  });
}
