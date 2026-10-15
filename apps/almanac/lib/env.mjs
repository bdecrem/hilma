// The environment for Claude Code subprocesses: Bart's Max login (CLAUDE_CODE_OAUTH_TOKEN), never an API key.
export function childEnv() {
  const env = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'adaptation-almanac/0.1' }
  delete env.ANTHROPIC_API_KEY
  return env
}
