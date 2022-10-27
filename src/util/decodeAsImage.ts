export default async function decodeAsImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.src = url;

    image.addEventListener('error', ({ error }) => {
      URL.revokeObjectURL(url);
      reject(error);
    });

    image.addEventListener('load', () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
  });
}
