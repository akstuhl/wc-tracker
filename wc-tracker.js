'use babel'

import { exec } from 'child_process'

const wordRegex = /[\u0027\u02BC\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u0180-\u024F\u1E02-\u1EF3]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u0531-\u0556\u0561-\u0586\u0559\u055A\u055B]+|[\u0374-\u03FF]+|\w+/g // (from wordcount Atom package)

export default function () {
  exec('git --no-pager diff --no-index --word-diff=porcelain a-tmp.md b-tmp.md', { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      if (error.code !== 1) { // git diff returns code 1 when there are differences, making `exec` think it failed
        console.log(error)
        return
      }
    }

    let added = 0
    let removed = 0

    const diffLines = stdout.split('\n').slice(3)
    diffLines.forEach(line => {
      if (line.match(/^\+/)) added += line.match(wordRegex).length
      else if (line.match(/^-/)) removed += line.match(wordRegex).length
    })

    console.log(`${added} words added, ${removed} words removed (net change ${added - removed} words)`)
  })
}
