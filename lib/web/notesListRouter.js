'use strict'

const Router = require('express').Router
const { Op } = require('sequelize')

const models = require('../models')
const errors = require('../errors')
const logger = require('../logger')

const notesListRouter = module.exports = Router()

const DEFAULT_LIMIT = 18
const MAX_LIMIT = 100

// the notes a visitor may see; mirrors checkViewPermission in note/util.js:
// private notes are owner only, limited/protected require a login and
// everything else is visible to everyone
function viewableWhere (user) {
  if (user) {
    return {
      [Op.or]: [
        { permission: { [Op.ne]: 'private' } },
        { permission: 'private', ownerId: user.id }
      ]
    }
  }
  return {
    permission: { [Op.notIn]: ['private', 'limited', 'protected'] }
  }
}

function parseHistoryIds (user) {
  const ids = new Set()
  if (!user) return ids
  let history = user.history
  try {
    if (typeof history === 'string') history = JSON.parse(history)
  } catch (err) {
    logger.error('could not parse user history: ' + err)
    history = []
  }
  if (Array.isArray(history)) {
    history.forEach(function (item) {
      if (item && item.id) ids.add(String(item.id))
    })
  }
  return ids
}

// list the notes visible to the current visitor
// query parameters: page, limit, scope (mine|others|all), search, sort, order
notesListRouter.get('/api/notes', async function (req, res) {
  try {
    const user = req.isAuthenticated() ? req.user : null
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    const scope = ['mine', 'others'].includes(req.query.scope) ? req.query.scope : 'all'
    const search = (req.query.search || '').trim()
    const sortField = req.query.sort === 'title' ? 'title' : 'updatedAt'
    const sortOrder = req.query.order === 'asc' ? 'ASC' : 'DESC'

    const where = { [Op.and]: [viewableWhere(user)] }
    if (scope === 'mine') {
      if (!user) {
        return res.send({ total: 0, page, limit, notes: [] })
      }
      where[Op.and].push({ ownerId: user.id })
    } else if (scope === 'others' && user) {
      where[Op.and].push({
        [Op.or]: [{ ownerId: { [Op.ne]: user.id } }, { ownerId: null }]
      })
    }
    if (search) {
      where[Op.and].push({
        [Op.or]: [
          { title: { [Op.like]: '%' + search + '%' } },
          { alias: { [Op.like]: '%' + search + '%' } }
        ]
      })
    }

    const result = await models.Note.findAndCountAll({
      where,
      order: [[sortField, sortOrder]],
      limit,
      offset: (page - 1) * limit,
      include: [{
        model: models.User,
        as: 'owner',
        required: false,
        attributes: ['id', 'profile']
      }]
    })

    const historyIds = parseHistoryIds(user)
    const notes = result.rows.map(function (note) {
      const id = note.alias || models.Note.encodeNoteId(note.id)
      return {
        id,
        alias: note.alias || null,
        title: models.Note.decodeTitle(note.title),
        permission: note.permission,
        ownerId: note.ownerId || null,
        ownerName: (note.owner && note.owner.profile && note.owner.profile.name) || null,
        updatedAt: note.updatedAt,
        mine: !!(user && note.ownerId === user.id),
        inHistory: user
          ? historyIds.has(id) || historyIds.has(models.Note.encodeNoteId(note.id))
          : null
      }
    })

    res.send({
      total: result.count,
      page,
      limit,
      notes
    })
  } catch (err) {
    logger.error('listing notes failed: ' + err)
    return errors.errorInternalError(res)
  }
})

// delete a note from the listing; only the owner may do this
notesListRouter.delete('/api/notes/:noteId', async function (req, res) {
  // this is a JSON API: answer with plain errors instead of the
  // login-redirect flow used by the page routes
  if (!req.isAuthenticated()) {
    return res.status(403).send({ error: 'Forbidden' })
  }
  try {
    const id = await new Promise(function (resolve, reject) {
      models.Note.parseNoteId(req.params.noteId, function (err, id) {
        if (err) reject(err)
        else resolve(id)
      })
    })
    if (!id) return errors.errorNotFound(res)
    const note = await models.Note.findOne({ where: { id } })
    if (!note) return errors.errorNotFound(res)
    if (note.ownerId !== req.user.id) {
      return res.status(403).send({ error: 'Forbidden' })
    }
    await models.Note.destroy({ where: { id } })
    res.end()
  } catch (err) {
    logger.error('deleting note failed: ' + err)
    return errors.errorInternalError(res)
  }
})
