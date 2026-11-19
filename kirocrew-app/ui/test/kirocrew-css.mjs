// The Kiro Crew stylesheet the class check runs against (UC4).
//
// kirocrew-css.json names a release, its published package, the stylesheet
// inside it and the SHA-256 of that stylesheet. The test reads just that one
// file out of the package with HTTP range requests, checks the digest, and
// caches it in the temporary directory. A file whose digest differs is
// refused, never used.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

export const pin = JSON.parse(readFileSync(new URL('./kirocrew-css.json', import.meta.url), 'utf8'))

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Returns the stylesheet text when its digest is the pinned one.
export function checkDigest(bytes, expected = pin.sha256) {
  const actual = sha256(bytes)
  if (actual !== expected) throw new Error(`Kiro Crew stylesheet refused: sha256 ${actual}, pinned ${expected}`)
  return bytes.toString('utf8')
}

// A request that stalls is cut after 15 seconds and tried again, three times
// in all, so one slow connection does not hold a CI job to its test timeout.
async function retried(url, init) {
  let last
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    } catch (error) {
      last = error
    }
  }
  throw last
}

async function range(url, start, end) {
  const response = await retried(url, {
    headers: { Range: `bytes=${start}-${end}` },
  })
  if (response.status !== 206) throw new Error(`${url}: range request answered ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

// Reads one member of a remote zip: the end record, the central directory,
// the local header, then the member's bytes. Zip64 is not handled; a wheel
// of a few hundred megabytes does not need it.
export async function readZipMember(url, matches) {
  const head = await retried(url, { method: 'HEAD' })
  const size = Number(head.headers.get('content-length'))
  if (!size) throw new Error(`${url}: no content-length`)
  const tail = await range(url, Math.max(0, size - 65557), size - 1)
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error(`${url}: not a zip file`)
  const entries = tail.readUInt16LE(eocd + 10)
  const dirSize = tail.readUInt32LE(eocd + 12)
  const dirStart = tail.readUInt32LE(eocd + 16)
  const dir = await range(url, dirStart, dirStart + dirSize - 1)
  const found = []
  for (let at = 0, n = 0; n < entries; n++) {
    if (dir.readUInt32LE(at) !== 0x02014b50) throw new Error(`${url}: bad central directory`)
    const method = dir.readUInt16LE(at + 10)
    const compressed = dir.readUInt32LE(at + 20)
    const nameLength = dir.readUInt16LE(at + 28)
    const extraLength = dir.readUInt16LE(at + 30)
    const commentLength = dir.readUInt16LE(at + 32)
    const local = dir.readUInt32LE(at + 42)
    const name = dir.toString('utf8', at + 46, at + 46 + nameLength)
    if (matches(name)) found.push({ name, method, compressed, local })
    at += 46 + nameLength + extraLength + commentLength
  }
  if (found.length !== 1) throw new Error(`${url}: ${found.length} members match, expected one`)
  const { method, compressed, local } = found[0]
  const header = await range(url, local, local + 29)
  const skip = 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
  const data = await range(url, local + skip, local + skip + compressed - 1)
  if (method === 0) return data
  if (method === 8) return inflateRawSync(data)
  throw new Error(`${url}: unsupported compression ${method}`)
}

// The pinned stylesheet's text, from the cache or the package.
export async function kirocrewStylesheet() {
  const cache = path.join(tmpdir(), 'avoozl-kirocrew-css')
  const file = path.join(cache, `${pin.sha256}.css`)
  if (existsSync(file)) {
    try {
      return checkDigest(readFileSync(file))
    } catch {
      // a damaged cache file is fetched again
    }
  }
  const bytes = await readZipMember(pin.package, (name) => new RegExp(pin.member).test(name))
  const text = checkDigest(bytes)
  mkdirSync(cache, { recursive: true })
  writeFileSync(file, bytes)
  return text
}
