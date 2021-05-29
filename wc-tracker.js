'use babel'

import { exec } from 'child_process'
import { mkdir, readFile, writeFile, copyFile, stat, constants } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import moment from 'moment'
import md5 from 'md5'

const debug = true

const storageDir = '.wc-tracker'

const wordRegex = /[\u0027\u02BC\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u0180-\u024F\u1E02-\u1EF3]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u0531-\u0556\u0561-\u0586\u0559\u055A\u055B]+|[\u0374-\u03FF]+|\w+/g // (from wordcount Atom package)

// Compute the aggregate counts across all files that the index is tracking.
// handler = function (error, wordsAdded, wordsRemoved, fileCount)
export function tracker (handler) {
  getIndex((err, index) => {
    if (err) throw err

    trackFromIndex(index, false, null, handler)
  })
}

// Try to add each file in <paths> to today's cache and to the index, then run the tracker, reporting the aggregate counts across the specified files and which of the files are now newly tracked.
// handler = function (error, added, removed, fileCount, newlyTrackedPaths)
// Reporting could look like:
//   Began tracking the following 2 files:
//   /Users/andy/blah.md
//   /Users/andy/new.md
//   206 words added and 82 words removed across 6 previously tracked files
export function track (paths, options, handler) {
  if (!paths || paths.length < 1) {
    handler('No files matched that path or pattern.')
    return
  }

  getIndex((err, index) => {
    if (err) throw err

    // TODO split this out into another func, since multiple CLI commands will allow option setting
    // for (const key in options) {
    //   if (['clock-start', 'interval', 'scope'].indexOf(key) < 0) handler(`ERROR: unsupported option "${key}"`)
    //   else index[key] = options[key]
    // }

    const todayStorage = getCurrentStorageDir()
    mkdir(todayStorage, { recursive: true }, err => {
      if (err) throw err

      const fileHashesToCount = []
      const newlyTrackedPaths = []
      let fileCount = 0
      let indexNeedsUpdate = false

      paths.forEach(path => {
        path = resolve(process.cwd(), path)
        const pathHash = md5(path)
        const cachePath = `${getCurrentStorageDir()}/${pathHash}.txt` // todo use resolve or join

        if (!index.files) index.files = {}
        const indexEntry = index.files[pathHash] || { path }

        copyFile(path, cachePath, constants.COPYFILE_EXCL, err => {
          if (err) {
            if (err.code !== 'EEXIST') throw err
            // if the cached file already exists, add it to the list that trackFromIndex will consult
            fileHashesToCount.push(pathHash)
          } else { // if written successfully, create the index.files entry
            indexEntry.added = 0
            indexEntry.removed = 0
            indexEntry.updated = Date.now()
            newlyTrackedPaths.push(path)
            index.files[pathHash] = indexEntry
            indexNeedsUpdate = true
          }
          fileCount++
          if (fileCount === paths.length) {
            trackFromIndex(index, indexNeedsUpdate, fileHashesToCount, (err, added, removed, preexFileCount) => {
              if (err) throw err

              handler(null, added, removed, preexFileCount, newlyTrackedPaths)
            })
          }
        })
      })
    })
  })
}

// handler = function (error, wordsAdded, wordsRemoved, fileCount)
function trackFromIndex (index, indexNeedsUpdate, fileHashesToCount, handler) {
  let added = 0
  let removed = 0
  let fileCount = 0

  if (index.files) {
    if (!fileHashesToCount) fileHashesToCount = Object.keys(index.files)
    const fileCountTotal = fileHashesToCount.length

    const updateIndex = function () {
      if (indexNeedsUpdate) {
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

      // check if file has been touched more recently than its 'updated' value, run diff and update index if so
      stat(file.path, {}, (err, stats) => {
        if (err) throw err
        if (!file.updated || file.updated < stats.mtimeMs) {
          countWordDiff(resolve(getCurrentStorageDir(), `${hash}.txt`), file.path, (e, a, r) => {
            if (e) throw e
            added += file.added = a
            removed += file.removed = r
            file.updated = Date.now()
            indexNeedsUpdate = true
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
  }
}

// handler = function (error, wordsAdded, wordsRemoved)
function countWordDiff (source, cached, handler) {
  exec(`git --no-pager diff --no-index --word-diff=porcelain "${source}" "${cached}"`, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      if (error.code !== 1) { // git diff returns code 1 when there are differences, making `exec` think it failed
        throw error
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
      else throw err
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
