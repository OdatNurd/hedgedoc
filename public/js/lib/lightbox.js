// Image lightbox for rendered markdown content.
//
// lightboxify() runs after finishView() and wraps eligible images so they can
// show a zoom badge; initLightbox() installs a single delegated listener that
// opens a body-level overlay when such an image is clicked. The overlay lives
// outside the rendered view on purpose: the view is rebuilt on every change.

const MIN_ZOOM_SIZE = 40 // natural width in px; smaller images are not zoomable

let initialized = false
let overlay = null
let overlayImg = null
let closeButton = null

// the natural size is only known once the image is loaded, so the zoomable
// mark is applied lazily
function markZoomable (img) {
  const wrapper = img.parentElement
  const update = function () {
    wrapper.classList.toggle('zoomable', img.naturalWidth >= MIN_ZOOM_SIZE)
  }
  if (img.complete) {
    update()
  } else {
    img.addEventListener('load', update, { once: true })
  }
}

export function lightboxify (view) {
  const root = view.jquery ? view[0] : view
  // slide decks keep their own click handling and layout
  if (!root || root.classList.contains('slides')) return
  root.querySelectorAll('img').forEach(function (img) {
    // linked images stay clickable links, aligned images depend on their
    // float and emoji are inline glyphs: none of them get a zoom affordance
    if (img.closest('a')) return
    if (img.closest('.img-lightbox')) return
    if (img.classList.contains('emoji')) return
    if (img.hasAttribute('align')) return
    const wrapper = document.createElement('span')
    wrapper.className = 'img-lightbox'
    img.parentNode.insertBefore(wrapper, img)
    wrapper.appendChild(img)
    markZoomable(img)
  })
}

function isOpen () {
  return overlay !== null && overlay.style.display !== 'none'
}

function buildOverlay () {
  overlay = document.createElement('div')
  overlay.className = 'lightbox-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Image preview')
  overlay.style.display = 'none'

  closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'lightbox-close'
  closeButton.setAttribute('aria-label', 'Close image preview')
  closeButton.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>'

  overlayImg = document.createElement('img')
  overlayImg.className = 'lightbox-image'
  overlayImg.alt = ''

  overlay.appendChild(closeButton)
  overlay.appendChild(overlayImg)
  document.body.appendChild(overlay)
}

function openLightbox (img) {
  const naturalWidth = img.naturalWidth
  const naturalHeight = img.naturalHeight
  if (!naturalWidth || !naturalHeight) return
  if (!overlay) buildOverlay()
  // fit into the viewport, keeping the aspect ratio, but never upscale
  const scale = Math.min(1,
    (window.innerWidth * 0.95) / naturalWidth,
    (window.innerHeight * 0.95) / naturalHeight)
  overlayImg.src = img.currentSrc || img.src
  overlayImg.alt = img.alt || ''
  overlayImg.style.width = Math.round(naturalWidth * scale) + 'px'
  overlayImg.style.height = Math.round(naturalHeight * scale) + 'px'
  overlay.style.display = 'flex'
  document.body.classList.add('lightbox-open')
  closeButton.focus()
}

function closeLightbox () {
  if (!overlay) return
  overlay.style.display = 'none'
  // free the decoded image data; the source is set again on the next open
  overlayImg.removeAttribute('src')
  document.body.classList.remove('lightbox-open')
}

export function initLightbox () {
  if (initialized) return
  initialized = true

  document.addEventListener('click', function (event) {
    const target = event.target
    if (!target || !target.closest) return
    if (isOpen()) {
      // clicking the backdrop or the circular close button closes the
      // overlay; clicking the image itself leaves it open
      if (target === overlay || target.closest('.lightbox-close')) {
        closeLightbox()
      }
      return
    }
    const img = target.closest('.markdown-body .img-lightbox.zoomable img')
    if (img) {
      event.preventDefault()
      openLightbox(img)
    }
  })

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) {
      closeLightbox()
    }
  })
}
