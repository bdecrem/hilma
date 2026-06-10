/*
 * applescript.ts - send an iMessage through Messages.app via osascript.
 *
 * We address the existing chat by its GUID (chat.guid from chat.db), which
 * works uniformly for 1:1 and group chats - no need to re-resolve a handle or
 * create a new conversation. Sending is the one outward-facing action here, so
 * IMSG_DRY_RUN=1 short-circuits it (build/verify without texting anyone).
 */

import { execFileSync } from 'node:child_process';

function asAppleStr(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function sendIMessage(chatGuid: string, text: string): void {
  if (process.env.IMSG_DRY_RUN) {
    console.error(`[imessage DRY_RUN] would send to ${chatGuid}: ${JSON.stringify(text)}`);
    return;
  }
  const script =
    `tell application "Messages"\n` +
    `  send ${asAppleStr(text)} to chat id ${asAppleStr(chatGuid)}\n` +
    `end tell`;
  execFileSync('/usr/bin/osascript', ['-e', script], { timeout: 30000 });
}
