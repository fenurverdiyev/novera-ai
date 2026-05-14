class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const pcmData = input[0];
      // Post the PCM data back to the main thread
      this.port.postMessage(pcmData);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
