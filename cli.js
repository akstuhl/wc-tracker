#!/usr/bin/env node

import { tracker, track, setConfig } from './wc-tracker.js'

function logger (error, result) {
  if (error) console.log(error)
  console.log(result)
}

function usage () {
  const usageText = `
  wc-tracker tracks the number of words added and removed in text files that you add to its index.

  usage:
    wc-tracker <path>  add the file(s) to the tracking index, or output its progress if already added
    wc-tracker         output aggregate words added and removed across all tracked files
    wc-tracker reset   clear the tracking index and file cache
    wc-tracker usage   print this message


    options:

    --interval=[days], -i     how often the tracker starts over, defaults to 1 (day)
    --clock-start=[HH:MM], -c time of day the tracker starts over, defaults to 04:00
    --verbose, -v             output the interval, clock-start, and tracked file list
  `

  console.log(usageText)
}

const args = process.argv
if (args.length <= 2) {
  tracker((error, added, removed, fileCount) => {
    if (error) console.error(error)
    if (fileCount < 1) console.log('No files are being tracked yet. Run `wc-tracker <path>` to start tracking something.')
    else console.log(`${added} words added and ${removed} words removed across ${fileCount} tracked file${fileCount > 1 ? 's' : ''} (net change ${added - removed} words)`)
  })
} else if (args[2] === 'usage') usage()
else if (args[2] === 'set' && args.length === 5) setConfig(args[3], args[4], logger)
else {
  track(args[2], {}, (error, added, removed, newlyTrackedPath) => {
    if (error) console.error(error)
    if (newlyTrackedPath) console.log(`Began tracking ${newlyTrackedPath}`)
    else console.log(`${added} words added, ${removed} words removed (net change ${added - removed} words)`)
  })
}
