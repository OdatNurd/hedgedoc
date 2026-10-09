'use strict'

const assert = require('assert')
const express = require('express')
const http = require('http')

describe('Gist import API', function () {
  let server
  let baseUrl
  let realFetch
  let apiPayload
  let rawPayloads
  let fetchedUrls

  before(function (done) {
    const app = express()
    app.use(require('../lib/web/importRouter'))
    server = http.createServer(app)
    server.listen(0, '127.0.0.1', function () {
      baseUrl = 'http://127.0.0.1:' + server.address().port
      done()
    })
  })

  after(function (done) {
    // fetch keeps sockets alive; drop them so close() can finish
    if (server.closeAllConnections) server.closeAllConnections()
    server.close(done)
  })

  beforeEach(function () {
    apiPayload = null
    rawPayloads = {}
    fetchedUrls = []
    realFetch = global.fetch
    global.fetch = async function (url, options) {
      const target = String(url)
      if (target.startsWith('http://127.0.0.1')) {
        return realFetch(url, options)
      }
      fetchedUrls.push(target)
      if (target.startsWith('https://api.github.com/gists/')) {
        if (!apiPayload) {
          return new Response('not found', { status: 404 })
        }
        return new Response(JSON.stringify(apiPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (Object.prototype.hasOwnProperty.call(rawPayloads, target)) {
        return new Response(rawPayloads[target], { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }
  })

  afterEach(function () {
    global.fetch = realFetch
  })

  async function get (path) {
    const res = await realFetch(baseUrl + path)
    const body = res.status === 200 ? await res.json() : null
    return { status: res.status, body }
  }

  it('rejects invalid gist ids', async function () {
    const res = await get('/gist/not-a-gist-id!')
    assert.strictEqual(res.status, 400)
  })

  it('passes the description and page url through', async function () {
    apiPayload = {
      description: 'All kinds of Repo Screenshots',
      html_url: 'https://gist.github.com/user/abc123',
      files: {
        'notes.md': {
          type: 'text/markdown',
          language: 'Markdown',
          size: 5,
          truncated: false,
          content: 'hello',
          raw_url: 'https://gist.githubusercontent.com/x/raw/notes.md'
        }
      }
    }
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.description, 'All kinds of Repo Screenshots')
    assert.strictEqual(res.body.htmlUrl, 'https://gist.github.com/user/abc123')
  })

  it('hands text files over as content', async function () {
    apiPayload = {
      description: '',
      html_url: 'https://gist.github.com/user/abc123',
      files: {
        'script.py': {
          type: 'text/x-python',
          language: 'Python',
          size: 6,
          truncated: false,
          content: 'print()',
          raw_url: 'https://gist.githubusercontent.com/x/raw/script.py'
        }
      }
    }
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(res.body.files['script.py'], {
      content: 'print()',
      rawUrl: 'https://gist.githubusercontent.com/x/raw/script.py',
      size: 6,
      mediaType: 'text/x-python',
      image: false,
      binary: false
    })
  })

  it('flags images as binary and never ships their payload', async function () {
    apiPayload = {
      description: '',
      html_url: 'https://gist.github.com/user/abc123',
      files: {
        'demo.gif': {
          type: 'image/gif',
          language: null,
          size: 296577,
          truncated: false,
          content: 'R0lGODlhqAIYAvchACYsMyUoMRcZ'.repeat(40),
          raw_url: 'https://gist.githubusercontent.com/x/raw/demo.gif'
        }
      }
    }
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(res.body.files['demo.gif'], {
      content: '',
      rawUrl: 'https://gist.githubusercontent.com/x/raw/demo.gif',
      size: 296577,
      mediaType: 'image/gif',
      image: true,
      binary: true
    })
    // the raw url must not be fetched for binary files
    assert.deepStrictEqual(fetchedUrls, ['https://api.github.com/gists/abc123'])
  })

  it('flags base64 payloads without type information as binary', async function () {
    apiPayload = {
      description: '',
      html_url: 'https://gist.github.com/user/abc123',
      files: {
        'blob.bin': {
          type: '',
          language: null,
          size: 300,
          truncated: false,
          content: 'R0lGODlhqAIYAvchACYsMyUoMRcZI1t0lhQrTnB9nSMnMCYtOScsNiQwMyUt'.repeat(5),
          raw_url: 'https://gist.githubusercontent.com/x/raw/blob.bin'
        }
      }
    }
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.files['blob.bin'].binary, true)
    assert.strictEqual(res.body.files['blob.bin'].content, '')
  })

  it('keeps unknown text extensions as text even without a language', async function () {
    apiPayload = {
      description: '',
      html_url: 'https://gist.github.com/user/abc123',
      files: {
        'data.log': {
          type: 'text/plain',
          language: null,
          size: 11,
          truncated: false,
          content: 'hello world',
          raw_url: 'https://gist.githubusercontent.com/x/raw/data.log'
        }
      }
    }
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.files['data.log'].binary, false)
    assert.strictEqual(res.body.files['data.log'].content, 'hello world')
  })

  it('fetches the raw content for truncated text files', async function () {
    apiPayload = {
      description: '',
      html_url: 'https://gist.github.com/user/abc123',
      files: {
        'big.txt': {
          type: 'text/plain',
          language: 'Text',
          size: 300000,
          truncated: true,
          content: 'cut off...',
          raw_url: 'https://gist.githubusercontent.com/x/raw/big.txt'
        }
      }
    }
    rawPayloads['https://gist.githubusercontent.com/x/raw/big.txt'] = 'the full content'
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.files['big.txt'].content, 'the full content')
    assert.ok(fetchedUrls.includes('https://gist.githubusercontent.com/x/raw/big.txt'))
  })

  it('reports upstream failures as 502', async function () {
    apiPayload = null
    const res = await get('/gist/abc123')
    assert.strictEqual(res.status, 502)
  })
})
