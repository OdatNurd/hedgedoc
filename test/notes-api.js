'use strict'

const assert = require('assert')
const express = require('express')
const http = require('http')

const models = require('../lib/models')

describe('Notes list API', function () {
  let server
  let baseUrl
  let currentUser

  before(function (done) {
    const app = express()
    app.use(function (req, res, next) {
      req.user = currentUser
      req.isAuthenticated = function () {
        return !!currentUser
      }
      next()
    })
    app.use(require('../lib/web/notesListRouter'))
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
    currentUser = null
    return models.sequelize.sync({ force: true })
  })

  async function get (path) {
    const res = await fetch(baseUrl + path)
    const body = res.status === 200 ? await res.json() : null
    return { status: res.status, body }
  }

  async function del (path) {
    const res = await fetch(baseUrl + path, { method: 'DELETE' })
    return { status: res.status }
  }

  function noteId (note) {
    return note.alias || models.Note.encodeNoteId(note.id)
  }

  it('shows only publicly viewable notes to guests', async function () {
    const user = await models.User.create({})
    await models.Note.create({ title: 'plain', content: 'body', permission: 'freely' })
    await models.Note.create({ title: 'auth edit', content: 'body', permission: 'editable' })
    await models.Note.create({ title: 'locked', content: 'body', permission: 'locked' })
    await models.Note.create({ title: 'limited', content: 'body', permission: 'limited' })
    await models.Note.create({ title: 'protected', content: 'body', permission: 'protected' })
    await models.Note.create({ ownerId: user.id, title: 'priv', content: 'body', permission: 'private' })

    const res = await get('/api/notes')
    assert.strictEqual(res.status, 200)
    const titles = res.body.notes.map(n => n.title)
    assert.deepStrictEqual(titles.sort(), ['auth edit', 'locked', 'plain'])
    assert.strictEqual(res.body.total, 3)
  })

  it('shows limited/protected notes and own private notes to signed-in users', async function () {
    const user = await models.User.create({})
    const other = await models.User.create({})
    await models.Note.create({ ownerId: other.id, title: 'others priv', content: 'body', permission: 'private' })
    await models.Note.create({ ownerId: user.id, title: 'own priv', content: 'body', permission: 'private' })
    await models.Note.create({ title: 'limited', content: 'body', permission: 'limited' })

    currentUser = user
    const res = await get('/api/notes')
    assert.strictEqual(res.status, 200)
    const titles = res.body.notes.map(n => n.title)
    assert.deepStrictEqual(titles.sort(), ['limited', 'own priv'])
  })

  it('flags own notes that are missing from the history as orphans', async function () {
    const user = await models.User.create({})
    const inHistory = await models.Note.create({ ownerId: user.id, title: 'known', content: 'body', permission: 'locked' })
    await models.Note.create({ ownerId: user.id, title: 'orphan', content: 'body', permission: 'locked' })
    await models.User.update({
      history: JSON.stringify([{ id: noteId(inHistory), text: 'known', time: Date.now() }])
    }, { where: { id: user.id } })

    currentUser = await models.User.findOne({ where: { id: user.id } })
    const res = await get('/api/notes?scope=mine')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.notes.length, 2)
    const byTitle = {}
    res.body.notes.forEach(n => { byTitle[n.title] = n })
    assert.strictEqual(byTitle.known.inHistory, true)
    assert.strictEqual(byTitle.orphan.inHistory, false)
    assert.strictEqual(byTitle.orphan.mine, true)
  })

  it('paginates with 18 notes per page by default', async function () {
    const notes = []
    for (let i = 0; i < 20; i++) {
      notes.push(models.Note.create({ title: 'note ' + i, content: 'body', permission: 'freely' }))
    }
    await Promise.all(notes)

    const page1 = await get('/api/notes')
    assert.strictEqual(page1.body.notes.length, 18)
    assert.strictEqual(page1.body.total, 20)
    const page2 = await get('/api/notes?page=2')
    assert.strictEqual(page2.body.notes.length, 2)
  })

  it('lets the owner delete a note and nobody else', async function () {
    const user = await models.User.create({})
    const other = await models.User.create({})
    const owned = await models.Note.create({ ownerId: user.id, title: 'owned', content: 'body', permission: 'locked' })
    const foreign = await models.Note.create({ ownerId: other.id, title: 'foreign', content: 'body', permission: 'locked' })

    // guests cannot delete
    let res = await del('/api/notes/' + noteId(owned))
    assert.strictEqual(res.status, 403)

    // other users cannot delete
    currentUser = other
    res = await del('/api/notes/' + noteId(owned))
    assert.strictEqual(res.status, 403)

    // the owner can delete their own note
    currentUser = user
    res = await del('/api/notes/' + noteId(owned))
    assert.strictEqual(res.status, 200)
    assert.strictEqual(await models.Note.count({ where: { id: owned.id } }), 0)

    // but not somebody else's
    res = await del('/api/notes/' + noteId(foreign))
    assert.strictEqual(res.status, 403)
    assert.strictEqual(await models.Note.count({ where: { id: foreign.id } }), 1)

    // unknown notes give a 404
    res = await del('/api/notes/doesnotexist')
    assert.strictEqual(res.status, 404)
  })
})
