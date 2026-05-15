import { pipeline, env } from '@xenova/transformers';

// Skip local check to only use CDN
env.allowLocalModels = false;

// We will use a singleton pattern for the pipeline
class PipelineSingleton {
  static task = 'automatic-speech-recognition';
  static model = 'Xenova/whisper-base.en';
  static instance: any = null;

  static async getInstance(progress_callback: Function) {
    if (this.instance === null) {
      this.instance = pipeline(this.task as any, this.model, { progress_callback });
    }
    return this.instance;
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  const { audio, text } = event.data;

  try {
    // Send a message indicating that the model is loading
    self.postMessage({ status: 'loading' });

    // Retrieve the pipeline instance. We pass a progress callback to track downloading.
    const transcriber = await PipelineSingleton.getInstance((x: any) => {
      self.postMessage({ status: 'progress', data: x });
    });

    self.postMessage({ status: 'transcribing' });

    // Run the audio through the transcriber
    // Whisper outputs timestamps if return_timestamps is true.
    // If text is provided, we can pass it as initial_prompt.
    const output = await transcriber(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      // Prevents Whisper from compressing repeated sections (choruses) by remembering
      // what it already said — each chunk is transcribed from audio alone
      condition_on_previous_text: false,
      ...(text ? { initial_prompt: text } : {})
    });

    // Send the final result back
    self.postMessage({ status: 'complete', result: output });

  } catch (error: any) {
    self.postMessage({ status: 'error', error: error.message });
  }
});
