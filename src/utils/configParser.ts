import { readFileSync } from 'fs'
import { exit } from 'process'
import { AppConf } from '../types/types'
import cLog from './cLog'

/**
 * Парсит путь к конфигурационному файлу из аргументов командной строки
 * @returns Путь к файлу конфигурации
 */
export function getConfigPath(): string {
  const args = process.argv
  const configArg = args.find((arg) => arg.startsWith('--conf='))

  if (configArg) {
    return configArg.split('=')[1]
  }

  return './conf.json'
}

/**
 * Читает и парсит конфигурационный файл
 * @param configPath Путь к файлу конфигурации
 * @returns Объект конфигурации
 */
export function loadConfig(configPath: string): AppConf {
  try {
    const configContent = readFileSync(configPath, 'utf-8')
    const conf = JSON.parse(configContent) as AppConf
    cLog(`Config ${configPath} loaded`)
    return conf
  } catch (error) {
    console.error(
      `Failed to read config "${configPath}". You can set it with --conf=path/to/config.json`,
    )
    exit(1)
  }
}
