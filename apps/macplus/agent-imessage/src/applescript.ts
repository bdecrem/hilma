/*
 * applescript.ts - send an iMessage through Messages.app via osascript.
 *
 * We address the existing chat by its GUID (chat.guid from chat.db), which
 * works uniformly for 1:1 and group chats - no need to re-resolve a handle or
 * create a new conversation. Sending is the one outward-facing action here, so
 * IMSG_DRY_RUN=1 short-circuits it (build/verify without texting anyone).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/* Run osascript ASYNCHRONOUSLY. Synchronous execFileSync was a foot-gun here:
 * the FIRST send under the launchd agent triggers a macOS Automation consent
 * prompt on the mini's screen, and until someone clicks it osascript blocks —
 * a synchronous call froze the agent's ENTIRE single-threaded event loop for the
 * full timeout, so every Plus client saw a dead "Sending…". Async keeps the loop
 * live (other reads/clients keep working) and the timeout returns a clean IMERR.
 * 15s is plenty for a real send; a blocked-on-permission call fails fast enough
 * that the Plus isn't left hanging. If you get ETIMEDOUT / "not authorized",
 * grant Automation control of Messages to the agent's node binary on the mini. */
async function runOsascript(script: string): Promise<void> {
  await execFileP('/usr/bin/osascript', ['-e', script], { timeout: 15000, killSignal: 'SIGKILL' });
}

function asAppleStr(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export async function sendIMessage(chatGuid: string, text: string): Promise<void> {
  if (process.env.IMSG_DRY_RUN) {
    console.error(`[imessage DRY_RUN] would send to ${chatGuid}: ${JSON.stringify(text)}`);
    return;
  }
  const script =
    `tell application "Messages"\n` +
    `  send ${asAppleStr(text)} to chat id ${asAppleStr(chatGuid)}\n` +
    `end tell`;
  await runOsascript(script);
}

/* Start a NEW conversation with a handle that has no existing chat (the "New"
 * button flow). Unlike sendIMessage, there's no chat GUID yet, so we address the
 * participant directly: try iMessage (blue) first, fall back to SMS (green) for
 * numbers not on iMessage. SMS routing requires Text Message Forwarding on for
 * this Mac. */
export async function sendIMessageToHandle(handle: string, text: string): Promise<void> {
  if (process.env.IMSG_DRY_RUN) {
    console.error(`[imessage DRY_RUN] would start a NEW chat to ${handle}: ${JSON.stringify(text)}`);
    return;
  }
  const h = asAppleStr(handle), t = asAppleStr(text);
  const script =
    `tell application "Messages"\n` +
    `  try\n` +
    `    set svc to 1st service whose service type = iMessage\n` +
    `    send ${t} to participant ${h} of svc\n` +
    `  on error\n` +
    `    set svc to 1st service whose service type = SMS\n` +
    `    send ${t} to participant ${h} of svc\n` +
    `  end try\n` +
    `end tell`;
  await runOsascript(script);
}
