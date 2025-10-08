// This AudioWorkletProcessor is responsible for receiving audio data from the microphone
// and posting it back to the main thread.
class AudioProcessor extends AudioWorkletProcessor {
  // The process method is called for every block of audio data.
  process(inputs, outputs, parameters) {
    // We only need the first input channel.
    const input = inputs[0];
    if (input.length > 0) {
      // Post the Float32Array of PCM data back to the main thread.
      // The data is not cloned, but transferred for performance.
      this.port.postMessage(input[0]);
    }
    // Return true to keep the processor alive.
    return true;
  }
}

// Register the processor with the name 'audio-processor'.
registerProcessor('audio-processor', AudioProcessor);
