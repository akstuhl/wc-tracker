# wc-tracker: track writing progress across text files

## Overview

`wc-tracker` keeps a running count of words added and deleted from any file you add to its index. Intended as a tool to track writing progress in a plain text drafting workflow, the script lets you set the tracking interval (i.e. for a daily or weekly goal) and the time of day when the interval resets.

## Example

```
> wc-tracker README.md
# Began tracking 1 file:
# /Users/me/dev/wc-tracker/README.md
> wc-tracker
# 252 words added and 86 words removed across 8 tracked files (net change 166 words)
```

## Installation

```
npm i -g wc-tracker
```

(Recommended to use the `-g` option when planning to use the command line interface)

## CLI

```
wc-tracker <path>    start tracking file(s); report progress if already tracked
wc-tracker           report total words added and removed across tracked files

Commands:
  wc-tracker clear   delete the entire tracking index

Options:
      --help         Show help                                         [boolean]
      --version      Show version number                               [boolean]
  -v, --verbose      Run with verbose logging                            [count]
  -i, --interval     Set the length, in days, of the tracking window
  -c, --clock-start  Set what time of day the tracking window starts over
                                                                        [string]

Examples:
  wc-tracker ~/Documents/**/*.md  track the number of words added and removed in
                                   any markdown file within Documents
```

## API

```
import { update, track, clear } from 'wc-tracker'
```

```
update(options, runtimeOptions, callback)
```

Report the aggregate counts across all files that the index is tracking.

- options -- `{ interval: <int>, "clock-start": <string, e.g. "04:00"> }`
- runtimeOptions -- `{ verbose: <int> }`
- callback -- `function (error, wordsAdded, wordsRemoved, fileCount)`

<br>

```
track (paths, options, runtimeOptions, callback)
```

Try to add each file in `paths` to the index, then report the aggregate counts across the specified files that were already tracked; also report the paths of files that are now newly tracked.

- paths -- `[<string>, ...]`
- options -- `{ interval: <int>, "clock-start": <string, e.g. "04:00"> }`
- runtimeOptions -- `{ verbose: <int> }`
- callback -- `function (error, added, removed, alreadyTrackedFileCount, newlyTrackedPaths)`

<br>

```
clear (options, callback)
```

Delete the entire tracking index and cache storage.

- options -- `{ confirm: <boolean> }`
- callback -- `function (error)`
