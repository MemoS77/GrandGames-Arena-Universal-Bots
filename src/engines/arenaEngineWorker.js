import { parentPort, workerData } from 'worker_threads'
import { pathToFileURL } from 'url'

const { enginePath, gameId } = workerData

let engine
try {
  const url = pathToFileURL(enginePath).href
  const mod = await import(url)

  engine = gameId ? new mod.default(gameId) : new mod.default()
} catch (err) {
  parentPort.postMessage({ type: 'initError', error: String(err) })
  process.exit(1)
}

parentPort.on('message', async (msg) => {
  if (msg.type !== 'getBestMove') return

  const { id, position, player, players, thinkTimeLimit, maxPlayers } = msg
  try {
    const playersState =
      players ??
      Array.from({ length: maxPlayers }, (_, i) => (i === player ? 1 : 0))
    const state = { position, players: playersState, update: null }
    const result = await engine.getBestMove(state, player, thinkTimeLimit)

    if (result === null || result === undefined) {
      parentPort.postMessage({
        type: 'error',
        id,
        error: 'Engine returned null move',
      })
    } else {
      parentPort.postMessage({ type: 'result', id, result })
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', id, error: String(err) })
  }
})

parentPort.postMessage({ type: 'ready' })
