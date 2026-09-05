export function execSync(cmd) { throw new Error(`Shell commands are not available in the browser (${String(cmd).slice(0, 40)})`); }
export function exec() { throw new Error('Shell commands are not available in the browser'); }
export function spawnSync() { throw new Error('Shell commands are not available in the browser'); }
export default { execSync, exec, spawnSync };
