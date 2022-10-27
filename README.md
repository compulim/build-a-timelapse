# Build a timelapse

Prototype to show how to use `MediaRecorder` to build a timelapse.

We tried WebCodecs, `ImageDecoder` and `VideoEncoder`. They paired very well. However, it is currently lacking media container feature. We cannot use them for outputting to file.

Thus, we need to go back and use the older `MediaRecorder` and `Canvas` instead.

This is just a prototype, need a lot of flushing.
