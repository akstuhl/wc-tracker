'use babel'

import { exec } from 'child_process'
import { mkdir, readFile, writeFile, copyFile, stat, constants, rm } from 'fs'
import { resolve, join } from 'path'
import { homedir } from 'os'
import md5 from 'md5'
import { parse, lightFormat, addDays, subHours, subMinutes } from 'date-fns'

const storageDir = '.wc-tracker'
const storageFormat = 'txt'
const tmpDir = 'tmp'
const indexName = 'index.json'
const storageDateFormat = 'yyyyMMdd'

const allowedOptions = {
  // interval: positive int indicating number of days
  interval: {
    default: 1,
    validator: value => {
      if (Number.isInteger(value) && value > 0) return value
      return null
    },
    print: value => {
      if (value) return `${value} day${value > 1 ? 's' : ''}`
      return '(not set)'
    }
  },
  // clock-start: string indicating time in 23-hour HH:MM format (when in the day the interval resets)
  'clock-start': {
    default: { hours: 4, minutes: 0 },
    validator: value => {
      const validated = {}
      if (typeof value === 'string') {
        const matches = value.match(/^(\d\d?)(?::(\d\d))?$/)
        if (matches.length > 1 && matches[1]) {
          validated.hours = parseInt(matches[1])
          validated.minutes = (matches.length > 2 && matches[2]) ? parseInt(matches[2]) : 0
          return validated
        }
      }
      return null
    },
    print: value => {
      if (!value) return '(not set)'
      return `${value.hours}:${String(value.minutes).padStart(2, '0')}`
    }
  }
}

const wordRegex = /[\u0027\u02BC\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u0180-\u024F\u1E02-\u1EF3]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u0531-\u0556\u0561-\u0586\u0559\u055A\u055B]+|[\u0374-\u03FF]+|\w+/g // (from wordcount Atom package)

// Compute the aggregate counts across all files that the index is tracking.
// handler = function (error, wordsAdded, wordsRemoved, fileCount)
export function update (options, runtimeOptions, handler) {
  loadIndex(options, (err, index) => {
    if (err) throw err

    trackFromIndex(index, null, runtimeOptions.verbose, handler)
  })
}

// Try to add each file in <paths> to today's cache and to the index, then run `update`, reporting the aggregate counts across the specified files and which of the files are now newly tracked.
// handler = function (error, added, removed, fileCount, newlyTrackedPaths)
// Reporting could look like:
//   Began tracking the following 2 files:
//   /Users/andy/blah.md
//   /Users/andy/new.md
//   206 words added and 82 words removed across 6 previously tracked files
export function track (paths, options, runtimeOptions, handler) {
  if (!paths || paths.length < 1) {
    handler(new Error('No files matched the specified paths.'))
    return
  }

  loadIndex(options, (err, index) => {
    if (err) throw err

    createCacheFiles(paths, index, (err, index, fileHashesToCount, newlyTrackedPaths) => {
      if (err) throw err

      trackFromIndex(index, fileHashesToCount, runtimeOptions.verbose, (err, added, removed, preexFileCount) => {
        if (err) throw err

        handler(null, added, removed, preexFileCount, newlyTrackedPaths)
      })
    })
  // })
  })
}

// Delete the entire tracking index and cache storage.
// handler = function (error)
export function clear (options, handler) {
  if (options.confirm) {
    rm(join(homedir(), storageDir), { recursive: true }, err => {
      if (err && err.code !== 'ENOENT') throw err

      if (handler) handler(null)
    })
  }
  else (handler('You must pass {confirm: true} to the options argument to clear the tracking index.'))
}

// handler = function (error, wordsAdded, wordsRemoved, fileCount)
function trackFromIndex (index, fileHashesToCount, verbose, handler) {
  let added = 0
  let removed = 0
  let fileCount = 0

  if (index.files) {
    if (!fileHashesToCount) fileHashesToCount = Object.keys(index.files)
    const fileCountTotal = fileHashesToCount.length

    const updateIndex = function () {
      if (verbose) {
        indexLogger(index)
      }
      if (index.needsUpdate) {
        delete index.needsUpdate
        writeFile(getIndexPath(), JSON.stringify(index), { encoding: 'utf-8' }, err => {
          if (err) throw err
          handler(null, added, removed, fileCount)
        })
      } else handler(null, added, removed, fileCount)
    }

    const processedFile = function () {
      fileCount++
      if (fileCount === fileCountTotal) updateIndex()
    }

    if (fileCountTotal < 1) {
      updateIndex()
      return
    }

    for (const hash of fileHashesToCount) {
      const file = index.files[hash]
      if (!file) handler(`Error: hash ${hash} not in index.`)

      // check if file has been modified more recently than its 'updated' value, run diff and update index if so
      stat(file.path, {}, (err, stats) => {
        // TODO - if the file has been deleted/renamed, gracefully ignore it
        if (err) throw err
        if (!file.updated || file.updated < stats.mtimeMs) {
          countWordDiff(resolve(getCurrentStorageDir(index), `${hash}.${storageFormat}`), file.path, verbose, (e, a, r) => {
            if (e) throw e
            added += file.added = a
            removed += file.removed = r
            file.updated = Date.now()
            index.needsUpdate = true
            index.files[hash] = file
            processedFile()
          })
        } else {
          if (file.added) added += file.added
          if (file.removed) removed += file.removed
          processedFile()
        }
      })
    }
  } else {
    handler(null, 0, 0, 0)
  }
}

// handler = function (error, index, alreadyExistingFileHashes, newlyCachedPaths)
function createCacheFiles (paths, index, handler) {
  let fileCount = 0
  const alreadyExistingFileHashes = []
  const newlyCachedPaths = []

  paths.forEach(path => {
    path = resolve(process.cwd(), path)
    const pathHash = md5(path)
    const cachePath = join(getCurrentStorageDir(index), `${pathHash}.${storageFormat}`)

    if (!index.files) index.files = {}
    const indexEntry = index.files[pathHash] || { path }

    copyFile(path, cachePath, constants.COPYFILE_EXCL, err => {
      if (err) {
        if (err.code === 'ENOTSUP') console.error(`ERROR: path "${path}" is not a file that can be copied`)
        else if (err.code !== 'EEXIST') throw err
        // if the cached file already exists, add it to the list that trackFromIndex will consult
        else alreadyExistingFileHashes.push(pathHash)
      } else { // if written successfully, create the index.files entry
        indexEntry.added = 0
        indexEntry.removed = 0
        indexEntry.updated = Date.now()
        newlyCachedPaths.push(path)
        index.files[pathHash] = indexEntry
        index.needsUpdate = true
      }
      fileCount++
      if (fileCount === paths.length) {
        handler(null, index, alreadyExistingFileHashes, newlyCachedPaths)
      }
    })
  })
}

// handler = function (error, wordsAdded, wordsRemoved)
function countWordDiff (source, cached, verbose, handler) {
  exec(`git --no-pager diff --no-index --word-diff=porcelain "${source}" "${cached}"`, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      if (error.code !== 1) { // git diff returns code 1 when there are differences, making `exec` think it failed
        throw error
      }
    }

    let added = 0
    let removed = 0

    const diffLines = stdout.split('\n').slice(5)
    if (verbose > 1) {
      console.log(source)
      console.log(diffLines)
      console.log('\n')
    }
    diffLines.forEach(line => {
      if (line.match(/^\+/)) added += line.match(wordRegex).length
      else if (line.match(/^-/)) removed += line.match(wordRegex).length
    })

    handler(null, added, removed)
  })
}

// handler = function (error, index)
function loadIndex (options, handler) {
  let index = {}
  let noIndex = false

  readFile(getIndexPath(), { encoding: 'utf-8' }, (err, contents) => {
    if (err && err.code !== 'ENOENT') throw err // expect an error when the file doesn't exist yet
    else if (contents) index = JSON.parse(contents)
    else noIndex = true

    index = processOptions(index, options)

    const clockStart = index['clock-start']
    const { interval, currentIntervalStartDate } = index
    const todayDate = lightFormat(subHours(subMinutes(new Date(), clockStart.minutes), clockStart.hours), storageDateFormat)

    if (!currentIntervalStartDate) {
      index.currentIntervalStartDate = todayDate
      index.needsUpdate = true
    }

    // if more than <interval> days have passed since the start of the current window, delete the tmp directory and freshly cache all indexed files
    const refDate = new Date()
    const intervalHasElapsed = addDays(parse(currentIntervalStartDate, storageDateFormat, refDate), interval) <= parse(todayDate, storageDateFormat, refDate)

    if (noIndex || intervalHasElapsed) {
      rm(join(homedir(), storageDir, tmpDir), { recursive: true }, err => {
        if (err && err.code !== 'ENOENT') throw err

        index.currentIntervalStartDate = todayDate
        index.needsUpdate = true

        makeFreshCacheDir(index, (err, i) => {
          if (err) throw err

          handler(null, i)
        })
      })
    } else {
      handler(null, index)
    }
  })
}

// handler = function (error, index)
function makeFreshCacheDir (index, handler) {
  const currentStorageDirPath = getCurrentStorageDir(index)
  mkdir(currentStorageDirPath, { recursive: true }, err => {
    if (err) throw err

    if (index.files && Object.keys(index.files).length > 0) {
      const filePaths = Object.keys(index.files).map(key => index.files[key].path)
      createCacheFiles(filePaths, index, (e, i, hashes) => {
        if (e) throw e

        index = i
        for (const hash of hashes) { // we expect this to be all the keys in index.files
          const indexEntry = index.files[hash]
          indexEntry.added = 0
          indexEntry.removed = 0
          indexEntry.updated = Date.now()
        }
        handler(null, index)
      })
    } else handler(null, index)
  })
}

function getIndexPath () {
  return join(homedir(), storageDir, indexName)
}

function processOptions (index, options) {
  for (const key in options) {
    if (Object.keys(allowedOptions).indexOf(key) < 0) console.error(`ERROR: unsupported option "${key}"`)
    else {
      const validated = allowedOptions[key].validator(options[key])
      if (!validated) console.error(`ERROR: value "${options[key]}" for option ${key} is incorrectly formatted`)
      else {
        index[key] = validated
        index.needsUpdate = true
      }
    }
  }
  for (const key in allowedOptions) {
    if (!index[key]) {
      index[key] = allowedOptions[key].default
      index.needsUpdate = true
    }
  }
  return index
}

function getCurrentStorageDir (index) {
  if (!index || !index.currentIntervalStartDate) throw new Error('expected an index object with property currentIntervalStartDate')
  return join(homedir(), storageDir, tmpDir, index.currentIntervalStartDate) // todo use join or resolve
}

function indexLogger (index) {
  if (index) {
    for (const option in allowedOptions) {
      console.log(`${option}: ${allowedOptions[option].print(index[option])}`)
    }
    if (index.files) {
      const hashes = Object.keys(index.files)
      if (hashes.length > 0) {
        console.log(`Currently tracking ${hashes.length} files:`)
        for (const hash in index.files) {
          const file = index.files[hash]
          console.log(file.path)
          for (const prop in file) {
            if (prop !== 'path') console.log(`  ${prop}: ${file[prop]}`)
          }
        }
      }
    }
  }
}
