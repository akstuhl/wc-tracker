#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { update, track } from '../wc-tracker.js'

// function logger (error, result) {
//   if (error) console.log(error)
//   console.log(result)
// }

// function usage () {
//   const usageText = `
//   wc-tracker tracks the number of words added and removed in text files that you add to its index.
//
//   usage:
//     wc-tracker <path>  add the file(s) to the tracking index, or output its progress if already added
//     wc-tracker         output aggregate words added and removed across all tracked files
//     wc-tracker reset   clear the tracking index and file cache
//     wc-tracker usage   print this message
//
//
//     options:
//
//     --interval=[days], -i     how often the tracker starts over, defaults to 1 (day)
//     --clock-start=[HH:MM], -c time of day the tracker starts over, defaults to 04:00
//     --verbose, -v             output the interval, clock-start, and tracked file list
//   `
//
//   console.log(usageText)
// }

const argv = yargs(hideBin(process.argv))
  .scriptName('wc-tracker')
  .usage(`
wc-tracker <path>    start tracking file(s); report progress if already tracked
wc-tracker           report total words added and removed across tracked files`)
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
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
  .argv

const options = {}
const keys = ['clock-start', 'interval']
for (const key of keys) {
  if (argv[key]) options[key] = argv[key]
}

if (argv._ && argv._.length > 0) {
  track(argv._, options, (error, added, removed, fileCount, newlyTrackedPaths) => {
    if (error) console.error(error)
    if (newlyTrackedPaths && newlyTrackedPaths.length > 0) console.log(`Began tracking ${newlyTrackedPaths.length} file${newlyTrackedPaths.length > 1 ? 's' : ''}:\n${newlyTrackedPaths.join('\n')}`)
    if (fileCount) console.log(`${added} words added, ${removed} words removed across ${fileCount} already tracked file${fileCount > 1 ? 's' : ''} (net change ${added - removed} words)`)
  })
} else {
  update(options, (error, added, removed, fileCount) => {
    if (error) console.error(error)
    if (fileCount < 1) console.log('No files are being tracked yet. Run `wc-tracker <path>` to start tracking something.')
    else console.log(`${added} words added and ${removed} words removed across ${fileCount} tracked file${fileCount > 1 ? 's' : ''} (net change ${added - removed} words)`)
  })
}
