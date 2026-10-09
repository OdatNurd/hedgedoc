'use strict'

const dns = require('dns').promises
const net = require('net')
const { URL } = require('url')

const Router = require('express').Router

const logger = require('../logger')

const importRouter = module.exports = Router()

const { importEndpoints } = require('./middleware/rateLimit')

const GIST_ID_REGEX = /^[a-f0-9]+$/i
const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 15000

function isPrivateAddress (address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8
      (a === 169 && b === 254) || // 169.254.0.0/16, link-local
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) // 192.168.0.0/16
    )
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase()
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fe80:') || // link-local
      lower.startsWith('fc') || // unique local
      lower.startsWith('fd') ||
      (lower.startsWith('::ffff:') && isPrivateAddress(lower.slice(7))) // v4-mapped
    )
  }
  // unknown address family: refuse rather than risk an internal request
  return true
}

// reject URLs that resolve to loopback/private/link-local addresses so the
// import proxy cannot be used to reach internal services
async function assertPublicUrl (url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  let addresses
  if (net.isIP(hostname)) {
    addresses = [hostname]
  } else {
    addresses = (await dns.lookup(hostname, { all: true })).map(entry => entry.address)
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('URL resolves to a private or loopback address')
  }
}

async function fetchWithLimits (url) {
  let current = url
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicUrl(current)
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'hedgedoc-import' }
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error('redirect without a location header')
      }
      current = new URL(location, current)
      continue
    }
    return response
  }
  throw new Error('too many redirects')
}

async function readCappedBody (response) {
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
    if (received > MAX_IMPORT_BYTES) {
      await reader.cancel()
      throw new Error('import target is larger than 2 MiB')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// gist files with binary content (images, archives, ...) arrive base64-encoded
// instead of text; text files always carry a text/* type or a detected language
function isBinaryGistFile (file) {
  const type = typeof file.type === 'string' ? file.type : ''
  if (type.startsWith('image/')) return true
  if (file.language != null) return false
  if (type.startsWith('text/')) return false
  if (type !== '') return true
  // no type information at all: fall back to the shape of the content
  return (
    typeof file.content === 'string' &&
    file.content.length > 256 &&
    !file.content.includes('\n') &&
    /^[A-Za-z0-9+/=]+$/.test(file.content)
  )
}

// fetch a github gist server-side and hand the file contents to the client
importRouter.get('/gist/:id', importEndpoints, async function (req, res) {
  const gistId = req.params.id
  if (!GIST_ID_REGEX.test(gistId)) {
    return res.status(400).json({ error: 'invalid gist id' })
  }
  try {
    const apiResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'hedgedoc',
        Accept: 'application/vnd.github+json'
      }
    })
    if (!apiResponse.ok) {
      logger.warn(`gist import: GitHub API returned ${apiResponse.status} for gist ${gistId}`)
      return res.status(502).json({ error: `GitHub API returned ${apiResponse.status}` })
    }
    const data = await apiResponse.json()
    if (!data.files || Object.keys(data.files).length === 0) {
      return res.status(502).json({ error: 'gist contains no files' })
    }
    const files = {}
    for (const [name, file] of Object.entries(data.files)) {
      const info = {
        content: '',
        rawUrl: file.raw_url || '',
        size: file.size || 0,
        mediaType: file.type || '',
        image: false,
        binary: false
      }
      if (isBinaryGistFile(file)) {
        // never ship binary payloads (base64) to the client, just the metadata
        info.binary = true
        info.image = info.mediaType.startsWith('image/')
      } else if (file.content !== undefined && !file.truncated) {
        info.content = file.content
      } else if (file.raw_url) {
        // large files are truncated in the API response, fetch the raw content
        const rawResponse = await fetch(file.raw_url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { 'User-Agent': 'hedgedoc' }
        })
        info.content = rawResponse.ok ? await readCappedBody(rawResponse) : ''
      }
      files[name] = info
    }
    res.json({
      description: data.description || '',
      htmlUrl: data.html_url || '',
      files
    })
  } catch (err) {
    logger.error(`gist import failed: ${err.message}`)
    res.status(502).json({ error: `unable to fetch gist: ${err.message}` })
  }
})

// fetch an arbitrary http(s) URL server-side so the client does not depend on
// CORS and cannot reach internal services
importRouter.get('/import', importEndpoints, async function (req, res) {
  let url
  try {
    url = new URL(String(req.query.url))
  } catch (err) {
    return res.status(400).json({ error: 'invalid url' })
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return res.status(400).json({ error: 'only http and https URLs can be imported' })
  }
  if (url.username || url.password) {
    return res.status(400).json({ error: 'URLs with embedded credentials cannot be imported' })
  }
  try {
    const upstream = await fetchWithLimits(url)
    if (!upstream.ok) {
      return res.status(502).json({ error: `import target returned ${upstream.status}` })
    }
    const content = await readCappedBody(upstream)
    res.json({
      url: upstream.url,
      contentType: upstream.headers.get('content-type') || '',
      content
    })
  } catch (err) {
    logger.warn(`import from url failed: ${err.message}`)
    res.status(502).json({ error: `unable to import: ${err.message}` })
  }
})
