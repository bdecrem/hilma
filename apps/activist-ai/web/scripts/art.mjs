#!/usr/bin/env node
// Writes the two drawings the sign-in screen uses, from the landing page's own drawing code
// (../site/src/drawing.mjs), as static SVG files in public/ (the CSP allows images from 'self'):
//   public/desk.svg       the study at night with the lamp on ("Our datacenter")
//   public/wordmark.svg   the brushed "Ola," in paper, with the vermilion comma
//   node scripts/art.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scene, T, wmPaths } from '../../site/src/drawing.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const out = (name, svg) => fs.writeFileSync(path.join(HERE, '../public', name), svg)
out('desk.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 26 600 586">${scene(T)}</svg>\n`)
out('wordmark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 250">${wmPaths('display', '#f7f0e3', '#ff6a3d')}</svg>\n`)
console.log('wrote public/desk.svg and public/wordmark.svg')
