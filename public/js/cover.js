/* global moment, serverurl */

import {
  checkIfAuth,
  clearLoginState,
  getLoginState,
  resetCheckAuth,
  setloginStateChangeEvent
} from './lib/common/login'

import {
  clearDuplicatedHistory,
  deleteServerHistory,
  getHistory,
  getStorageHistory,
  parseHistory,
  parseServerToHistory,
  parseStorageToHistory,
  postHistoryToServer,
  removeHistory,
  saveHistory,
  saveStorageHistoryToServer
} from './history'

import { saveAs } from 'file-saver'
import List from 'list.js'
import { unescapeHtml } from './utils'

require('./locale')

require('../css/cover.css')
require('../css/site.css')

require('./fix-aria-hidden-for-modals')

const options = {
  valueNames: ['id', 'text', 'timestamp', 'fromNow', 'time', 'tags', 'pinned'],
  item: `<li class="col-xs-12 col-sm-6 col-md-6 col-lg-4">
          <span class="id" style="display:none;"></span>
          <a href="#">
            <div class="item">
              <div class="ui-history-pin fa fa-thumb-tack fa-fw"></div>
              <div class="ui-history-close fa fa-close fa-fw" data-toggle="modal" data-target=".delete-history-modal"></div>
              <div class="content">
                <h4 class="text"></h4>
                <p>
                  <i><i class="fa fa-clock-o"></i> visited </i><i class="fromNow"></i>
                  <br>
                  <i class="timestamp" style="display:none;"></i>
                  <i class="time"></i>
                </p>
                <p class="tags"></p>
              </div>
            </div>
          </a>
        </li>`,
  page: 18,
  pagination: [{
    outerWindow: 1
  }]
}
const historyList = new List('history', options)

setloginStateChangeEvent(pageInit)

pageInit()

function pageInit () {
  checkIfAuth(
    data => {
      $('.ui-signin').hide()
      $('.ui-or').hide()
      $('.ui-welcome').show()
      if (data.photo) $('.ui-avatar').prop('src', data.photo).show()
      else $('.ui-avatar').prop('src', '').hide()
      $('.ui-name').html(data.name)
      $('.ui-signout').show()
      parseServerToHistory(historyList, parseHistoryCallback)
    },
    () => {
      $('.ui-signin').show()
      $('.ui-or').show()
      $('.ui-welcome').hide()
      $('.ui-avatar').prop('src', '').hide()
      $('.ui-name').html('')
      $('.ui-signout').hide()
      parseStorageToHistory(historyList, parseHistoryCallback)
    }
  )
}

$('.masthead-nav li').click(function () {
  $(this).siblings().removeClass('active')
  $(this).addClass('active')
})

// notes tab: every note the current user can see, with own notes on top;
// both lists are sortable and paginated, newest first by default
const notesState = {
  mine: { page: 1, total: 0, limit: 18, sort: 'updatedAt', order: 'desc' },
  others: { page: 1, total: 0, limit: 18, sort: 'updatedAt', order: 'desc' }
}
let notesLoaded = false

$('.masthead-nav .ui-notes a').click(function (e) {
  e.preventDefault()
  $('#history').hide()
  $('#notes').show()
  loadNotes()
})

$('.masthead-nav .ui-history a').click(function (e) {
  e.preventDefault()
  $('#notes').hide()
  $('#history').show()
})

function loadNotes (force) {
  if (notesLoaded && !force) return
  notesLoaded = true
  fetchNotes('mine')
  fetchNotes('others')
}

function fetchNotes (scope) {
  const state = notesState[scope]
  $.get(serverurl + '/api/notes', {
    scope,
    page: state.page,
    limit: state.limit,
    sort: state.sort,
    order: state.order
  })
    .done(function (data) {
      state.total = data.total
      state.limit = data.limit
      renderNotes(scope, data.notes)
    })
    .fail(function () {
      renderNotes(scope, [])
    })
}

// sort a notes list by clicking the Title / Updated column headers
$('.ui-notes-list').on('click', '.ui-notes-sort', function (e) {
  e.preventDefault()
  const $list = $(this).closest('.ui-notes-list')
  const scope = $list.hasClass('ui-notes-list-mine') ? 'mine' : 'others'
  const state = notesState[scope]
  const sort = $(this).attr('data-sort')
  if (state.sort === sort) {
    state.order = state.order === 'asc' ? 'desc' : 'asc'
  } else {
    state.sort = sort
    // titles read best ascending, dates newest first
    state.order = sort === 'title' ? 'asc' : 'desc'
  }
  state.page = 1
  updateNotesSortIndicators($list, state)
  fetchNotes(scope)
})

function updateNotesSortIndicators ($list, state) {
  $list.find('.ui-notes-sort').each(function () {
    const active = $(this).attr('data-sort') === state.sort
    $(this).toggleClass('active', active)
    $(this)
      .find('i')
      .toggleClass('fa-sort', !active)
      .toggleClass('fa-sort-asc', active && state.order === 'asc')
      .toggleClass('fa-sort-desc', active && state.order === 'desc')
  })
}

function renderNotes (scope, notes) {
  const $list = $('.ui-notes-list-' + scope)
  const signedIn = getLoginState()
  const $body = $list.find('tbody')
  $body.empty()
  notes.forEach(function (note) {
    $body.append(buildNotesRow(note))
  })
  if (scope === 'mine') {
    $('.ui-notes-mine-hint').toggle(!signedIn)
  }
  // guests get the sign-in hint instead of an empty state
  const showEmpty = notes.length === 0 && (scope !== 'mine' || signedIn)
  $list.find('.ui-notes-empty').toggle(showEmpty)
  $list.find('.ui-notes-table').toggle(notes.length > 0)
  renderNotesPagination($list.find('.pagination'), notesState[scope], function (page) {
    notesState[scope].page = page
    fetchNotes(scope)
  })
}

function buildNotesRow (note) {
  const $row = $('<tr>')
  const $title = $('<td>')
  $('<a>')
    .attr('href', serverurl + '/' + note.id)
    .text(note.title || 'Untitled')
    .appendTo($title)
  if (note.inHistory === false) {
    $title.append(' ')
    $('<span class="label label-warning"></span>')
      .text($('#notes').data('not-in-history'))
      .appendTo($title)
  }
  $row.append($title)
  const $permission = $('<td>').text(note.permission || '')
  if (note.ownerName) {
    $permission.append(' ').append(
      $('<small class="text-muted"></small>').text(note.ownerName)
    )
  }
  $row.append($permission)
  $row.append($('<td>').text(moment(note.updatedAt).fromNow()))
  const $actions = $('<td class="text-right">')
  if (note.mine) {
    $('<button class="btn btn-xs btn-danger ui-notes-delete"></button>')
      .attr('data-id', note.id)
      .attr('title', $('#notes').data('confirm-delete'))
      .append('<i class="fa fa-trash-o"></i>')
      .appendTo($actions)
  }
  $row.append($actions)
  return $row
}

function renderNotesPagination ($pagination, state, onChange) {
  $pagination.empty()
  const totalPages = Math.ceil(state.total / state.limit)
  if (totalPages <= 1) return
  const $prev = $('<li><a href="#">&laquo;</a></li>')
  const $next = $('<li><a href="#">&raquo;</a></li>')
  const $current = $('<li class="disabled"><a></a></li>')
  $current.find('a').text(state.page + ' / ' + totalPages)
  $pagination.append($prev).append($current).append($next)
  $prev.toggleClass('disabled', state.page <= 1)
  $next.toggleClass('disabled', state.page >= totalPages)
  $prev.find('a').click(function (e) {
    e.preventDefault()
    if (state.page > 1) onChange(state.page - 1)
  })
  $next.find('a').click(function (e) {
    e.preventDefault()
    if (state.page < totalPages) onChange(state.page + 1)
  })
}

// delete own notes right from the listing
$('.ui-notes-list').on('click', '.ui-notes-delete', function (e) {
  e.preventDefault()
  const id = $(this).attr('data-id')
  if (!window.confirm($('#notes').data('confirm-delete'))) return
  $.ajax({
    url: serverurl + '/api/notes/' + encodeURIComponent(id),
    type: 'DELETE'
  }).always(function () {
    loadNotes(true)
  })
})

// prevent empty link change hash
$('a[href="#"]').click(function (e) {
  e.preventDefault()
})

function checkHistoryList () {
  if ($('#history-list').children().length > 0) {
    $('.pagination').show()
    $('.ui-nohistory').hide()
    $('.ui-import-from-browser').hide()
  } else if ($('#history-list').children().length === 0) {
    $('.pagination').hide()
    $('.ui-nohistory').slideDown()
    getStorageHistory(data => {
      if (data && data.length > 0 && getLoginState() && historyList.items.length === 0) {
        $('.ui-import-from-browser').slideDown()
      }
    })
  }
}

function parseHistoryCallback (list, notehistory) {
  checkHistoryList()
  // sort by pinned then timestamp
  list.sort('', {
    sortFunction (a, b) {
      const notea = a.values()
      const noteb = b.values()
      if (notea.pinned && !noteb.pinned) {
        return -1
      } else if (!notea.pinned && noteb.pinned) {
        return 1
      } else {
        if (notea.timestamp > noteb.timestamp) {
          return -1
        } else if (notea.timestamp < noteb.timestamp) {
          return 1
        } else {
          return 0
        }
      }
    }
  })
  // parse filter tags
  const filtertags = []
  for (let i = 0, l = list.items.length; i < l; i++) {
    const tags = list.items[i]._values.tags
    if (tags && tags.length > 0) {
      for (let j = 0; j < tags.length; j++) {
        // push info filtertags if not found
        let found = false
        if (filtertags.includes(tags[j])) { found = true }
        if (!found) { filtertags.push(tags[j]) }
      }
    }
  }
  buildTagsFilter(filtertags)
}

// update items whenever list updated
historyList.on('updated', e => {
  for (let i = 0, l = e.items.length; i < l; i++) {
    const item = e.items[i]
    if (item.visible()) {
      const itemEl = $(item.elm)
      const values = item._values
      const a = itemEl.find('a')
      const pin = itemEl.find('.ui-history-pin')
      const tagsEl = itemEl.find('.tags')
      // parse link to element a
      a.attr('href', `${serverurl}/${values.id}`)
      // parse pinned
      if (values.pinned) {
        pin.addClass('active')
      } else {
        pin.removeClass('active')
      }
      // parse tags
      const tags = values.tags
      if (tags && tags.length > 0 && tagsEl.children().length <= 0) {
        const labels = []
        for (let j = 0; j < tags.length; j++) {
          // push into the item label
          labels.push(`<span class='label label-default'>${tags[j]}</span>`)
        }
        tagsEl.html(labels.join(' '))
      }
    }
  }
  $('.ui-history-close').off('click')
  $('.ui-history-close').on('click', historyCloseClick)
  $('.ui-history-pin').off('click')
  $('.ui-history-pin').on('click', historyPinClick)
})

function historyCloseClick (e) {
  e.preventDefault()
  const id = $(this).closest('a').siblings('span').html()
  const value = historyList.get('id', id)[0]._values
  $('.ui-delete-history-modal-msg').text('Do you really want to delete below history?')
  $('.ui-delete-history-modal-item').html(`<i class="fa fa-file-text"></i> ${value.text}<br><i class="fa fa-clock-o"></i> ${value.time}`)
  clearHistory = false
  deleteId = id
}

function historyPinClick (e) {
  e.preventDefault()
  const $this = $(this)
  const id = $this.closest('a').siblings('span').html()
  const item = historyList.get('id', id)[0]
  const values = item._values
  let pinned = values.pinned
  if (!values.pinned) {
    pinned = true
    item._values.pinned = true
  } else {
    pinned = false
    item._values.pinned = false
  }
  checkIfAuth(() => {
    postHistoryToServer(id, {
      pinned
    }, (err, result) => {
      if (!err) {
        if (pinned) { $this.addClass('active') } else { $this.removeClass('active') }
      }
    })
  }, () => {
    getHistory(notehistory => {
      for (let i = 0; i < notehistory.length; i++) {
        if (notehistory[i].id === id) {
          notehistory[i].pinned = pinned
          break
        }
      }
      saveHistory(notehistory)
      if (pinned) { $this.addClass('active') } else { $this.removeClass('active') }
    })
  })
}

// auto update item fromNow every minutes
setInterval(updateItemFromNow, 60000)

function updateItemFromNow () {
  const items = $('.item').toArray()
  for (let i = 0; i < items.length; i++) {
    const item = $(items[i])
    const timestamp = parseInt(item.find('.timestamp').text())
    item.find('.fromNow').text(moment(timestamp).fromNow())
  }
}

let clearHistory = false
let deleteId = null

function deleteHistory () {
  checkIfAuth(() => {
    deleteServerHistory(deleteId, (err, result) => {
      if (!err) {
        if (clearHistory) {
          historyList.clear()
          checkHistoryList()
        } else {
          historyList.remove('id', deleteId)
          checkHistoryList()
        }
      }
      $('.delete-history-modal').modal('hide')
      deleteId = null
      clearHistory = false
    })
  }, () => {
    if (clearHistory) {
      saveHistory([])
      historyList.clear()
      checkHistoryList()
      deleteId = null
    } else {
      if (!deleteId) return
      getHistory(notehistory => {
        const newnotehistory = removeHistory(deleteId, notehistory)
        saveHistory(newnotehistory)
        historyList.remove('id', deleteId)
        checkHistoryList()
        deleteId = null
      })
    }
    $('.delete-history-modal').modal('hide')
    clearHistory = false
  })
}

$('.ui-delete-history-modal-confirm').click(() => {
  deleteHistory()
})

$('.ui-import-from-browser').click(() => {
  saveStorageHistoryToServer(() => {
    parseStorageToHistory(historyList, parseHistoryCallback)
  })
})

$('.ui-save-history').click(() => {
  getHistory(data => {
    const history = JSON.stringify(data)
    const blob = new Blob([history], {
      type: 'application/json;charset=utf-8'
    })
    saveAs(blob, `hedgedoc_history_${moment().format('YYYYMMDDHHmmss')}`, true)
  })
})

$('.ui-open-history').bind('change', e => {
  const files = e.target.files || e.dataTransfer.files
  const file = files[0]
  const reader = new FileReader()
  reader.onload = () => {
    const notehistory = JSON.parse(reader.result)
    // console.log(notehistory);
    if (!reader.result) return
    getHistory(data => {
      let mergedata = data.concat(notehistory)
      mergedata = clearDuplicatedHistory(mergedata)
      saveHistory(mergedata)
      parseHistory(historyList, parseHistoryCallback)
    })
    $('.ui-open-history').replaceWith($('.ui-open-history').val('').clone(true))
  }
  reader.readAsText(file)
})

$('.ui-clear-history').click(() => {
  $('.ui-delete-history-modal-msg').text('Do you really want to clear all history?')
  $('.ui-delete-history-modal-item').html('There is no turning back.')
  clearHistory = true
  deleteId = null
})

$('.ui-refresh-history').click(() => {
  const lastTags = $('.ui-use-tags').select2('val')
  $('.ui-use-tags').select2('val', '')
  historyList.filter()
  const lastKeyword = $('.search').val()
  $('.search').val('')
  historyList.search()
  $('#history-list').slideUp('fast')
  $('.pagination').hide()

  resetCheckAuth()
  historyList.clear()
  parseHistory(historyList, (list, notehistory) => {
    parseHistoryCallback(list, notehistory)
    $('.ui-use-tags').select2('val', lastTags)
    $('.ui-use-tags').trigger('change')
    historyList.search(lastKeyword)
    $('.search').val(lastKeyword)
    checkHistoryList()
    $('#history-list').slideDown('fast')
  })
})

$('.ui-delete-user-modal-cancel').click(() => {
  $('.ui-delete-user').parent().removeClass('active')
})

$('.ui-logout').click(() => {
  clearLoginState()
  location.href = `${serverurl}/logout`
})

let filtertags = []
$('.ui-use-tags').select2({
  placeholder: $('.ui-use-tags').attr('placeholder'),
  multiple: true,
  data () {
    return {
      results: filtertags
    }
  }
})
$('.select2-input').css('width', 'inherit')
buildTagsFilter([])

function buildTagsFilter (tags) {
  for (let i = 0; i < tags.length; i++) {
    tags[i] = {
      id: i,
      text: unescapeHtml(tags[i])
    }
  }
  filtertags = tags
}
$('.ui-use-tags').on('change', function () {
  const tags = []
  const data = $(this).select2('data')
  for (let i = 0; i < data.length; i++) { tags.push(data[i].text) }
  if (tags.length > 0) {
    historyList.filter(item => {
      const values = item.values()
      if (!values.tags) return false
      let found = false
      for (let i = 0; i < tags.length; i++) {
        if (values.tags.includes(tags[i])) {
          found = true
          break
        }
      }
      return found
    })
  } else {
    historyList.filter()
  }
  checkHistoryList()
})

$('.search').keyup(() => {
  checkHistoryList()
})

// focus user field after opening login modal
$('.signin-modal').on('shown.bs.modal', function () {
  const fieldLDAP = $('input[name=username]')
  const fieldEmail = $('input[name=email]')
  const fieldOpenID = $('input[name=openid_identifier]')
  if (fieldLDAP.length === 1) {
    fieldLDAP.focus()
  } else if (fieldEmail.length === 1) {
    fieldEmail.focus()
  } else if (fieldOpenID.length === 1) {
    fieldOpenID.focus()
  }
})
