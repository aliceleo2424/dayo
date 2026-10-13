/* Ephemeral PCM transport only. No recording, files or retained audio buffers. */
class PilotPCM extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Int16Array(1600); this.used = 0; this.phase = 0; this.sum = 0; this.n = 0; }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    if (input) for (const value of input) {
      this.sum += value; this.n += 1; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const sample = Math.max(-1, Math.min(1, this.sum / this.n));
        this.samples[this.used++] = sample < 0 ? sample * 32768 : sample * 32767;
        this.sum = 0; this.n = 0;
        if (this.used === this.samples.length) {
          const bytes = new ArrayBuffer(this.used * 2), view = new DataView(bytes);
          for (let i = 0; i < this.used; i++) view.setInt16(i * 2, this.samples[i], true);
          this.port.postMessage(bytes, [bytes]); this.used = 0;
        }
      }
    }
    for (const channels of outputs) for (const channel of channels) channel.fill(0);
    return true;
  }
}
registerProcessor('dayo-pilot-pcm', PilotPCM);
