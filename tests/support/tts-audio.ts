/** A real, short mono PCM WAV containing silence; no recorded voice or provider call. */
export function silentWav(): Uint8Array {
  const samples = 240;
  const data = new Uint8Array(44 + samples * 2);
  const view = new DataView(data.buffer);
  const text = (offset: number, value: string) => data.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, data.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return data;
}
