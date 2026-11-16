const players      = new Map(); // gid → Shoukaku player
const intervals    = new Map(); // gid → setInterval id (progress updater)
const aloneTimers  = new Map(); // gid → setTimeout id (alone timer)
const queues       = new Map(); // gid → Array<{ track, channel }>

const pausedStates  = new Map(); // gid → boolean
const pausedElapsed = new Map(); // gid → ms elapsed when paused

const currentTracks  = new Map(); // gid → track object
const currentMsgs    = new Map(); // gid → Discord Message
const startTimes     = new Map(); // gid → Date.now() when track started

const botVcIds       = new Map(); // gid → voice channel id (ห้องที่บอทอยู่ตอนนี้)
const previousTracks = new Map(); // gid → { track, channel }

const loopModes      = new Map(); // gid → 'none' | 'track' | 'queue'
const volumeLevels   = new Map(); // gid → number (0–100, default 100)
const volumeSetBy    = new Map(); // gid → userId

module.exports = {
  players,
  intervals,
  aloneTimers,
  queues,
  pausedStates,
  pausedElapsed,
  currentTracks,
  currentMsgs,
  startTimes,
  botVcIds,
  previousTracks,
  loopModes,
  volumeLevels,
  volumeSetBy,
};
