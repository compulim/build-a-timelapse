export default async function decodeImageAsVideoFrame(file: File): Promise<VideoFrame> {
  const imageDecoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/jpeg' });
  const { image } = await imageDecoder.decode();

  return image;
}
