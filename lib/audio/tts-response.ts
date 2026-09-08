export interface ValidatedTTSAudio {
  audio: Uint8Array;
  format: string;
}

const MIME_FORMATS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/aacp': 'aac',
  'audio/pcm': 'pcm',
  'audio/x-pcm': 'pcm',
  'audio/raw': 'pcm',
  'audio/l16': 'pcm',
  'audio/basic': 'ulaw',
  'audio/ulaw': 'ulaw',
  'audio/mulaw': 'ulaw',
  'audio/alaw': 'alaw',
};
const RAW_FORMATS = new Set(['pcm', 'ulaw', 'alaw']);

function matches(audio: Uint8Array, offset: number, value: string): boolean {
  return (
    audio.length >= offset + value.length &&
    [...value].every((char, index) => audio[offset + index] === char.charCodeAt(0))
  );
}

/** Container signatures, not a decoder or a promise of intelligible speech. */
function detectAudioFormat(audio: Uint8Array): string | null {
  if (
    audio.length > 12 &&
    ['RIFF', 'RIFX', 'RF64'].some((signature) => matches(audio, 0, signature)) &&
    matches(audio, 8, 'WAVE')
  )
    return 'wav';
  if (audio.length >= 10 && matches(audio, 0, 'ID3') && audio[3] !== 0xff && audio[4] !== 0xff)
    return 'mp3';
  if (
    audio.length >= 4 &&
    audio[0] === 0xff &&
    (audio[1] & 0xe0) === 0xe0 &&
    (audio[1] & 0x18) !== 0x08 &&
    (audio[1] & 0x06) !== 0 &&
    (audio[2] & 0xf0) !== 0xf0 &&
    (audio[2] & 0x0c) !== 0x0c
  )
    return 'mp3';
  if (audio.length >= 7 && audio[0] === 0xff && (audio[1] & 0xf6) === 0xf0) return 'aac';
  if (audio.length >= 8 && matches(audio, 0, 'fLaC')) return 'flac';
  if (audio.length >= 27 && matches(audio, 0, 'OggS') && audio[4] === 0) return 'ogg';
  if (audio.length >= 12 && matches(audio, 4, 'ftyp')) return 'm4a';
  if (
    audio.length >= 8 &&
    audio[0] === 0x1a &&
    audio[1] === 0x45 &&
    audio[2] === 0xdf &&
    audio[3] === 0xa3 &&
    new TextDecoder().decode(audio.subarray(0, 512)).includes('webm')
  )
    return 'webm';
  return null;
}

function isTextError(audio: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(audio.subarray(0, 512)).trimStart();
  if (/^<(?:!doctype\s+html|html(?:\s|>)|\?xml)/i.test(prefix)) return true;
  if (!['{', '[', '"'].includes(prefix[0])) return false;
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(audio));
    return true;
  } catch {
    return false;
  }
}

/** Raw samples are accepted only when the caller explicitly requested that format. */
export function validateTTSAudioPayload(
  audio: Uint8Array,
  requestedFormat?: string,
): ValidatedTTSAudio {
  if (!audio.length) throw new Error('TTS provider returned empty audio');
  const detected = detectAudioFormat(audio);
  if (detected)
    return { audio, format: detected === 'ogg' && requestedFormat === 'opus' ? 'opus' : detected };
  if (requestedFormat && RAW_FORMATS.has(requestedFormat) && !isTextError(audio)) {
    return { audio, format: requestedFormat };
  }
  throw new Error('TTS provider returned an unsupported or non-audio payload');
}

/** A successful HTTP status does not establish that the response contains audio. */
export async function readTTSAudioResponse(
  response: Response,
  requestedFormat?: string,
): Promise<ValidatedTTSAudio> {
  const mime = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const declared = Object.hasOwn(MIME_FORMATS, mime) ? MIME_FORMATS[mime] : undefined;
  if (mime && !declared && !['application/octet-stream', 'binary/octet-stream'].includes(mime)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`TTS provider returned a non-audio response (${mime})`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  // A contradictory audio Content-Type must not authorize headerless raw samples.
  return validateTTSAudioPayload(
    audio,
    !declared || declared === requestedFormat || (declared === 'ogg' && requestedFormat === 'opus')
      ? requestedFormat
      : undefined,
  );
}
