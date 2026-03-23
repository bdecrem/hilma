import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: string // 'http' | 'sse'
  url?: string
  headers?: Record<string, string>
}

interface McpServerInfo {
  name: string
  source: string // where the config came from
  type: 'local' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  envVars?: string[] // names only, not values
  enabled: boolean
  installed: boolean
  installDate?: string
  version?: string
  tools?: string[]
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function redactEnv(env?: Record<string, string>): string[] {
  if (!env) return []
  return Object.keys(env)
}

function parseServerConfig(name: string, config: McpServerConfig, source: string): McpServerInfo {
  if (config.type === 'http' || config.type === 'sse' || config.url) {
    return {
      name,
      source,
      type: (config.type as 'http' | 'sse') || 'http',
      url: config.url,
      envVars: redactEnv(config.env),
      enabled: true,
      installed: true,
    }
  }
  return {
    name,
    source,
    type: 'local',
    command: config.command,
    args: config.args,
    envVars: redactEnv(config.env),
    enabled: true,
    installed: true,
  }
}

function scanPluginDirectory(pluginsDir: string): McpServerInfo[] {
  const servers: McpServerInfo[] = []
  if (!existsSync(pluginsDir)) return servers

  // Scan cache (installed plugins)
  const cacheDir = join(pluginsDir, 'cache', 'claude-plugins-official')
  if (existsSync(cacheDir)) {
    for (const pluginName of readdirSync(cacheDir)) {
      const pluginDir = join(cacheDir, pluginName)
      if (!statSync(pluginDir).isDirectory()) continue

      // Check for versioned subdirectories
      for (const version of readdirSync(pluginDir)) {
        const versionDir = join(pluginDir, version)
        if (!statSync(versionDir).isDirectory()) continue

        const mcpJson = join(versionDir, '.mcp.json')
        if (existsSync(mcpJson)) {
          const config = readJsonSafe(mcpJson)
          if (config?.mcpServers) {
            const mcpServers = config.mcpServers as Record<string, McpServerConfig>
            for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
              const info = parseServerConfig(serverName, serverConfig, `plugin:${pluginName}`)
              info.version = version
              servers.push(info)
            }
          }
        }

        // Check for plugin metadata
        const pluginJson = join(versionDir, '.claude-plugin', 'plugin.json')
        if (existsSync(pluginJson)) {
          const meta = readJsonSafe(pluginJson)
          const matching = servers.find(s => s.source === `plugin:${pluginName}`)
          if (matching && meta) {
            matching.name = (meta.name as string) || matching.name
          }
        }
      }
    }
  }

  // Scan marketplace external plugins
  const marketDir = join(pluginsDir, 'marketplaces', 'claude-plugins-official', 'external_plugins')
  if (existsSync(marketDir)) {
    for (const pluginName of readdirSync(marketDir)) {
      const pluginDir = join(marketDir, pluginName)
      if (!statSync(pluginDir).isDirectory()) continue

      const mcpJson = join(pluginDir, '.mcp.json')
      if (existsSync(mcpJson)) {
        const config = readJsonSafe(mcpJson)
        if (config?.mcpServers) {
          // Skip if already found in cache (installed)
          const mcpServers = config.mcpServers as Record<string, McpServerConfig>
          for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
            const existing = servers.find(s => s.name === serverName)
            if (!existing) {
              const info = parseServerConfig(serverName, serverConfig, `marketplace:${pluginName}`)
              info.installed = false
              info.enabled = false
              servers.push(info)
            }
          }
        } else {
          // Some .mcp.json files have servers at top level (not nested under mcpServers)
          for (const [key, val] of Object.entries(config)) {
            if (typeof val === 'object' && val !== null && ('command' in val || 'url' in val || 'type' in val)) {
              const existing = servers.find(s => s.name === key)
              if (!existing) {
                const info = parseServerConfig(key, val as McpServerConfig, `marketplace:${pluginName}`)
                info.installed = false
                info.enabled = false
                servers.push(info)
              }
            }
          }
        }
      }
    }
  }

  return servers
}

function getEnabledPlugins(settingsPath: string): Record<string, boolean> {
  const settings = readJsonSafe(settingsPath)
  if (!settings) return {}
  return (settings.enabledPlugins as Record<string, boolean>) || {}
}

function getInstalledPlugins(pluginsDir: string): Record<string, { installedAt: string; version: string }> {
  const installedPath = join(pluginsDir, 'installed_plugins.json')
  const data = readJsonSafe(installedPath)
  if (!data?.plugins) return {}

  const result: Record<string, { installedAt: string; version: string }> = {}
  const plugins = data.plugins as Record<string, Array<{ installedAt: string; version: string }>>
  for (const [name, installs] of Object.entries(plugins)) {
    if (installs.length > 0) {
      result[name] = {
        installedAt: installs[0].installedAt,
        version: installs[0].version,
      }
    }
  }
  return result
}

function getToolPermissions(settingsPath: string): string[] {
  const settings = readJsonSafe(settingsPath)
  if (!settings?.permissions) return []
  const perms = settings.permissions as { allow?: string[] }
  return (perms.allow || []).filter((p: string) => p.startsWith('mcp__'))
}

export async function GET() {
  const home = homedir()
  const claudeDir = join(home, '.claude')
  const pluginsDir = join(claudeDir, 'plugins')
  const settingsPath = join(claudeDir, 'settings.json')

  // Get enabled plugins from settings
  const enabledPlugins = getEnabledPlugins(settingsPath)

  // Get installed plugin metadata
  const installedPlugins = getInstalledPlugins(pluginsDir)

  // Scan all plugin directories for MCP servers
  const servers = scanPluginDirectory(pluginsDir)

  // Enrich with enabled/installed status
  for (const server of servers) {
    const pluginKey = server.source.replace('plugin:', '').replace('marketplace:', '')
    const enabledKey = `${pluginKey}@claude-plugins-official`

    if (enabledKey in enabledPlugins) {
      server.enabled = enabledPlugins[enabledKey]
    }

    const installedKey = `${pluginKey}@claude-plugins-official`
    if (installedKey in installedPlugins) {
      server.installed = true
      server.installDate = installedPlugins[installedKey].installedAt
      server.version = installedPlugins[installedKey].version
    }
  }

  // Get MCP tool permissions from project settings
  const projectSettings = join(process.cwd(), '.claude', 'settings.local.json')
  const allowedTools = [
    ...getToolPermissions(settingsPath),
    ...getToolPermissions(projectSettings),
  ]

  // Extract tool names per server from permissions
  for (const server of servers) {
    const prefix = `mcp__plugin_${server.source.split(':')[1]}_${server.name}__`
    server.tools = allowedTools
      .filter(t => t.startsWith(prefix))
      .map(t => t.replace(prefix, ''))
  }

  return Response.json({
    timestamp: new Date().toISOString(),
    claudeDir,
    serverCount: servers.length,
    servers,
    allowedTools,
  })
}
