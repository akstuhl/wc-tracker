#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { update, track, clear } from '../wc-tracker.js'

const argv = yargs(hideBin(process.argv))
  .scriptName('wc-tracker')
  .usage(`
$0 <path>    start tracking file(s); report progress if already tracked
$0           report total words added and removed across tracked files`)
  .command('clear', ' delete the entire tracking index')
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    count: true,
    description: 'Run with verbose logging'
  })
  .option('interval', {
    alias: 'i',
    type: 'integer',
    description: 'Set the length, in days, of the tracking window'
  })
  .option('clock-start', {
    alias: 'c',
    type: 'string',
    description: 'Set what time of day the tracking window starts over'
  })
  .example('$0 ~/Documents/**/*.md', 'track the number of words added and removed in any markdown file within Documents')
  .argv

const options = {}
const keys = ['clock-start', 'interval']
for (const key of keys) {
  if (argv[key]) options[key] = argv[key]
}
const { verbose } = argv

if (argv._ && argv._.length > 0) {
  if (argv._[0] === 'clear') {
    clear({ confirm: true }, err => {
      if (err) console.error(err)
    })
  } else {
    track(argv._, options, { verbose }, (error, added, removed, fileCount, newlyTrackedPaths) => {
      if (error) console.error(error)
      if (newlyTrackedPaths && newlyTrackedPaths.length > 0) console.log(`Began tracking ${newlyTrackedPaths.length} file${newlyTrackedPaths.length > 1 ? 's' : ''}:\n${newlyTrackedPaths.join('\n')}`)
      if (fileCount) console.log(`${added} words added, ${removed} words removed across ${fileCount} already tracked file${fileCount > 1 ? 's' : ''} (net change ${added - removed} words)`)
    })
  }
} else {
  update(options, { verbose }, (error, added, removed, fileCount) => {
    if (error) console.error(error)
    if (fileCount < 1) console.log('No files are being tracked yet. Run `wc-tracker <path>` to start tracking something.')
    else console.log(`${added} words added and ${removed} words removed across ${fileCount} tracked file${fileCount > 1 ? 's' : ''} (net change ${added - removed} words)`)
  })
}
