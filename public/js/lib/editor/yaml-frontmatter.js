import CodeMirror from '@hedgedoc/codemirror-5/lib/codemirror.js'

// A mixed mode for markdown text with an optional YAML front matter block.
// Local variant of CodeMirror's "yaml-frontmatter" mode with strict delimiter
// detection: the front matter is only closed by a line that consists of
// exactly "---" or "..." (plus optional trailing whitespace), so thematic
// breaks like "----" or "--- text" are not mistaken for the closing delimiter.
const START = 0
const FRONTMATTER = 1
const BODY = 2

const OPEN_DELIMITER = /^---\s*$/
const CLOSE_DELIMITER = /^(---|\.\.\.)\s*$/

CodeMirror.defineMode('yaml-frontmatter', function (config, parserConfig) {
  const yamlMode = CodeMirror.getMode(config, 'yaml')
  const innerMode = CodeMirror.getMode(config, (parserConfig && parserConfig.base) || 'gfm')

  function localMode (state) {
    return state.state === FRONTMATTER
      ? { mode: yamlMode, state: state.yaml }
      : { mode: innerMode, state: state.inner }
  }

  return {
    startState: function () {
      return {
        state: START,
        yaml: null,
        inner: CodeMirror.startState(innerMode)
      }
    },

    copyState: function (state) {
      return {
        state: state.state,
        yaml: state.yaml && CodeMirror.copyState(yamlMode, state.yaml),
        inner: CodeMirror.copyState(innerMode, state.inner)
      }
    },

    token: function (stream, state) {
      if (state.state === START) {
        // front matter is only recognized when the document opens with it
        if (stream.sol() && stream.match(OPEN_DELIMITER, false)) {
          state.state = FRONTMATTER
          state.yaml = CodeMirror.startState(yamlMode)
          stream.match(OPEN_DELIMITER)
          return 'meta'
        }
        state.state = BODY
        return innerMode.token(stream, state.inner)
      }
      if (state.state === FRONTMATTER) {
        if (stream.sol() && stream.match(CLOSE_DELIMITER, false)) {
          // consume the closing delimiter so the markdown mode never sees it
          stream.match(CLOSE_DELIMITER)
          state.state = BODY
          state.yaml = null
          return 'meta'
        }
        return yamlMode.token(stream, state.yaml)
      }
      return innerMode.token(stream, state.inner)
    },

    blankLine: function (state) {
      if (state.state === START) {
        // a leading blank line means the document has no front matter
        state.state = BODY
        state.inner = CodeMirror.startState(innerMode)
        return
      }
      if (state.state === FRONTMATTER) {
        if (yamlMode.blankLine) return yamlMode.blankLine(state.yaml)
        return
      }
      if (innerMode.blankLine) return innerMode.blankLine(state.inner)
    },

    innerMode: localMode
  }
})

CodeMirror.defineMIME('text/x-yaml-frontmatter', 'yaml-frontmatter')
