/*
 * compile.ts — cross-compile one C file into a classic Mac app with Retro68.
 * Returns the MacBinary (.bin) on success, or the compiler errors on failure
 * (which codegen feeds back to Claude for a fix attempt).
 */

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const TOOLCHAIN =
  process.env.RETRO68_TOOLCHAIN ||
  join(homedir(), 'mac-plus-apps', 'Retro68-build', 'toolchain');

export function toolchainFile(): string {
  return join(TOOLCHAIN, 'm68k-apple-macos', 'cmake', 'retro68.toolchain.cmake');
}

export function toolchainAvailable(): boolean {
  return existsSync(toolchainFile());
}

export interface CompileResult {
  ok: boolean;
  bin?: Buffer;          // the MacBinary, ready to deliver
  errors?: string;       // compiler diagnostics, trimmed for the retry prompt
}

/** Keep the lines Claude needs to fix the build, drop the cmake noise. */
function trimErrors(out: string): string {
  const lines = out.split('\n').filter(
    (l) =>
      /error|warning|undefined reference|undeclared|conflicting|implicit/i.test(l) &&
      !/^make(\[|:)/.test(l)
  );
  const text = (lines.length ? lines : out.split('\n').slice(-30)).join('\n');
  return text.slice(0, 6000);
}

export async function compileApp(name: string, code: string): Promise<CompileResult> {
  const dir = await mkdtemp(join(tmpdir(), 'foundry-'));
  try {
    await writeFile(join(dir, 'app.c'), code);
    await writeFile(
      join(dir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.5)
project(${name} C)
add_application(${name} app.c)
set_target_properties(${name} PROPERTIES COMPILE_OPTIONS -ffunction-sections)
set_target_properties(${name} PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
`
    );
    const build = join(dir, 'build');
    try {
      await run('cmake', ['-S', dir, '-B', build, `-DCMAKE_TOOLCHAIN_FILE=${toolchainFile()}`], {
        timeout: 120_000,
      });
    } catch (e: any) {
      return { ok: false, errors: trimErrors(`${e.stdout ?? ''}\n${e.stderr ?? ''}`) };
    }
    try {
      await run('make', ['-C', build], { timeout: 180_000 });
    } catch (e: any) {
      return { ok: false, errors: trimErrors(`${e.stdout ?? ''}\n${e.stderr ?? ''}`) };
    }
    const bin = await readFile(join(build, `${name}.bin`));
    return { ok: true, bin };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
