import { renderTimelineExportAudio } from "@/lib/editor/audio/export-audio"

const RATE = 48000
function tone(seconds, freq, amp = 0.5) {
  const ctx = new OfflineAudioContext(2, seconds * RATE, RATE)
  const buffer = ctx.createBuffer(2, seconds * RATE, RATE)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++)
      data[i] = Math.sin((2 * Math.PI * freq * i) / RATE) * amp
  }
  return buffer
}
// Each sample encodes its own source time, so offsets can be read back.
function ramp(seconds) {
  const ctx = new OfflineAudioContext(1, seconds * RATE, RATE)
  const buffer = ctx.createBuffer(1, seconds * RATE, RATE)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = i / RATE / seconds
  return buffer
}
function rms(buffer, from, to) {
  const data = buffer.getChannelData(0)
  let sum = 0
  let n = 0
  for (let i = Math.floor(from * RATE); i < Math.floor(to * RATE); i++) {
    sum += data[i] * data[i]
    n++
  }
  return Math.sqrt(sum / Math.max(1, n))
}
const seg = (o) => ({
  fadeIn: 0,
  fadeOut: 0,
  playbackRate: 1,
  sourceIn: 0,
  volume: 1,
  ...o,
})

window.runMix = async () => {
  const music = tone(12, 220)
  const voice = tone(4, 440)
  const out = await renderTimelineExportAudio({
    legacy: null,
    mix: {
      buffers: new Map([
        ["music", music],
        ["voice", voice],
      ]),
      ducking: { amountDb: -12, enabled: true, rampSeconds: 0.5 },
      segments: [
        seg({
          key: "m",
          role: "music",
          timelineEnd: 10,
          timelineStart: 0,
          url: "music",
          fadeIn: 1,
        }),
        seg({
          key: "v",
          role: "dialogue",
          timelineEnd: 6,
          timelineStart: 4,
          url: "voice",
          sourceIn: 1,
        }),
      ],
    },
    totalDurationSeconds: 10,
    windowStartSeconds: 0,
  })
  // Music alone vs music ducked under voice: isolate by rendering music-only too.
  const musicOnly = await renderTimelineExportAudio({
    legacy: null,
    mix: {
      buffers: new Map([
        ["music", music],
        ["voice", voice],
      ]),
      ducking: { amountDb: -12, enabled: true, rampSeconds: 0.5 },
      segments: [
        seg({
          key: "m",
          role: "music",
          timelineEnd: 10,
          timelineStart: 0,
          url: "music",
          fadeIn: 1,
        }),
        seg({
          key: "v",
          role: "dialogue",
          timelineEnd: 6,
          timelineStart: 4,
          url: "voice",
          volume: 0.0000001,
        }),
      ],
    },
    totalDurationSeconds: 10,
    windowStartSeconds: 0,
  })
  // Offset check: a ramp clip at timeline 2..5 with sourceIn 3, exported from window start 1.
  const rampOut = await renderTimelineExportAudio({
    legacy: null,
    mix: {
      buffers: new Map([["r", ramp(20)]]),
      ducking: null,
      segments: [
        seg({
          key: "r",
          role: "music",
          timelineEnd: 5,
          timelineStart: 2,
          url: "r",
          sourceIn: 3,
        }),
      ],
    },
    totalDurationSeconds: 6,
    windowStartSeconds: 1,
  })
  const r = rampOut.getChannelData(0)
  return {
    fadeStart: rms(musicOnly, 0, 0.1),
    musicFull: rms(musicOnly, 2, 3),
    musicDucked: rms(musicOnly, 4.6, 5.4),
    musicRecovered: rms(musicOnly, 7, 8),
    mixedDuringVoice: rms(out, 4.6, 5.4),
    silenceBefore: Math.abs(r[Math.floor(0.5 * RATE)]),
    // output t=1 -> timeline 2 -> source 3 -> ramp value 3/20
    sourceAtStart: r[Math.floor(1.001 * RATE)] * 20,
    // output t=3 -> timeline 4 -> source 5
    sourceLater: r[Math.floor(3 * RATE)] * 20,
    silenceAfter: Math.abs(r[Math.floor(4.5 * RATE)]),
  }
}
window.ready = true
