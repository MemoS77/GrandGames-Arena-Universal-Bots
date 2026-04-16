import dotenv from 'dotenv'
import { getConfigPath, loadConfig } from './utils/configParser'

dotenv.config()

const configPath = getConfigPath()
const conf = loadConfig(configPath)

const minTimeout = 5000
const maxLivetime = 60000 * 20

const DEFAULT_MAX_THINK_TIME = 5000

export const WS_SERVER = conf?.server ?? null
export const JWT_TOKEN = conf?.token ?? ''
export const MAX_THINK_TIME = conf?.maxThinkTime ?? DEFAULT_MAX_THINK_TIME

export const MAX_TABLE_LIVE_TIME = Math.min(
  conf!.maxTableLiveTime || maxLivetime,
  maxLivetime,
)

export const RECONNECT_TIMEOUT = Math.max(
  conf!.reconnectTimeout || minTimeout,
  minTimeout,
)
export const LOOP_INTERVAL = 30000

export const gamesConf = conf!.games

export const MAX_SEARCH_MOVE_RESTART = 5
