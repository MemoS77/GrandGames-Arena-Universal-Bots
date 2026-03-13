import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { exit } from 'process'
import { AppConf } from './types/types'
import cLog from './funcs/cLog'

dotenv.config()

// Чтение аргумента командной строки --config=path/to/config.json
const args = process.argv
const configArg = args.find((arg) => arg.startsWith('--conf='))

let configPath = './conf.json'

if (configArg) configPath = configArg.split('=')[1]

// Чтение и парсинг файла конфигурации
let conf: AppConf
try {
  const configContent = readFileSync(configPath, 'utf-8')
  conf = JSON.parse(configContent) as AppConf
  cLog(`Config ${configPath} loaded`)
} catch (error) {
  console.error(
    `Failed to read config "${configPath}". You can set it with --conf=path/to/config.json`,
  )
  exit(1)
}

const minTimeout = 5000
const maxLivetime = 60000 * 20

export const WS_SERVER = conf!.server
export const JWT_TOKEN = conf!.token

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
