'use babel'

import { exec } from 'child_process'
import { mkdir, readFile, writeFile, copyFile, stat, constants } from 'fs'
import { resolve, join, normalize } from 'path'
import { homedir } from 'os'
import moment from 'moment'
import md5 from 'md5'

const debug = true

const storageDir = '.wc-tracker'

const wordRegex = /[\u0027\u02BC\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u0180-\u024F\u1E02-\u1EF3]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u0531-\u0556\u0561-\u0586\u0559\u055A\u055B]+|[\u0374-\u03FF]+|\w+/g // (from wordcount Atom package)

// handler args: (error, numAdded, numRemoved)
export function countWordDiff (source, cached, handler) {
  exec(`git --no-pager diff --no-index --word-diff=porcelain "${source}" "${cached}"`, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      if (error.code !== 1) { // git diff returns code 1 when there are differences, making `exec` think it failed
        console.log('in exec (git diff):', error)
        return
      }
    }

    let added = 0
    let removed = 0

    const diffLines = stdout.split('\n').slice(5)
    if (debug) console.log(diffLines)
    diffLines.forEach(line => {
      if (line.match(/^\+/)) added += line.match(wordRegex).length
      else if (line.match(/^-/)) removed += line.match(wordRegex).length
    })

    handler(null, added, removed)
  })
}

// Compute the aggergate counts across all files that the index is tracking.
export function tracker (handler) {
  let added = 0
  let removed = 0
  let fileCount = 0

  getIndex((err, index) => {
    if (err) throw err

    if (index.files) {
      for (const hash in index.files) {
        // TODO check if file has been touched more recently than its 'updated' value, run diff and update index if so

        const file = index.files[hash]
        if (file.added) added += file.added
        if (file.removed) removed += file.removed
        fileCount++
      }
    }

    handler(null, added, removed, fileCount)
  })
}

// Try to copy the file at <path> to today's cache. If it's already there, run the diff and send the results to <handler>. Update the file's entry in the index.
export function track (path, options, handler) {
  getIndex((err, index) => {
    if (err) throw err

    // TODO split this out into another func, since multiple CLI commands will allow option setting
    for (const key in options) {
      if (['clock-start', 'interval', 'scope'].indexOf(key) < 0) handler(`ERROR: unsupported option "${key}"`)
      else index[key] = options[key]
    }

    const todayStorage = getCurrentStorageDir()
    mkdir(todayStorage, { recursive: true }, err => {
      if (err) console.log(err) // TODO - specify the code we expect for when the directory already exists, throw any other errors

      path = resolve(process.cwd(), path)
      const pathHash = md5(path)
      const cachePath = `${getCurrentStorageDir()}/${pathHash}.txt`

      if (!index.files) index.files = {}
      const indexEntry = index.files[pathHash] || { path }

      let newlyTrackedPath = null

      const indexUpdatedHandler = err => {
        if (err) throw err

        handler(null, indexEntry.added, indexEntry.removed, newlyTrackedPath)
      }

      copyFile(path, cachePath, constants.COPYFILE_EXCL, err => {
        if (err) {
          // if the cached file already exists, run the diff (TODO: only if the source file has been modified more recently than the indexEntry's `updated` field)
          if (err.code !== 'EEXIST') throw err
          countWordDiff(cachePath, path, (err, added, removed) => {
            if (err) throw err
            indexEntry.added = added
            indexEntry.removed = removed
            updateIndexEntry(index, pathHash, indexEntry, indexUpdatedHandler)
          })
        } else { // if written successfully, no need to run diff, just create the index.files entry
          indexEntry.added = 0
          indexEntry.removed = 0
          newlyTrackedPath = path
          updateIndexEntry(index, pathHash, indexEntry, indexUpdatedHandler)
        }
      })
    })
  })
}

function updateIndexEntry (index, hash, entry, handler) {
  entry.updated = Date.now()

  index.files[hash] = entry

  writeFile(getIndexPath(), JSON.stringify(index), { encoding: 'utf-8' }, err => {
    if (err) throw err
    handler(null)
  })
}

export function setConfig (property, value, handler) {
  if (['clock-start', 'interval', 'scope'].indexOf(property) < 0) handler({}, 'ERROR: unsupported config property')
  else {
    getIndex((err, index) => {
      if (err) throw err
      index[property] = value
      writeFile(getIndexPath(), JSON.stringify(index), { encoding: 'utf-8' }, err => {
        if (err) throw err
        handler(null, JSON.stringify(index))
      })
    })
  }
}

export function getIndex (handler) {
  readFile(getIndexPath(), { encoding: 'utf-8' }, (err, contents) => {
    if (err) {
      if (err.code === 'ENOENT') handler(null, {}) // expect an error when the file doesn't exist yet
      else handler(err, {})
    } else {
      handler(null, JSON.parse(contents))
    }
  })
}

function getIndexPath () {
  return `${homedir}/${storageDir}/index.json`
}

function getCurrentStorageDir () {
  return `${homedir}/${storageDir}/tmp/${moment().format('YYYYMMDD')}`
}
