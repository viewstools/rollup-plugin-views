// most logic borrowed from rollup-plugin-svelte
const { basename, extname, parse, relative } = require('path')
const { createFilter } = require('rollup-pluginutils')
const fs = require('fs')
const globule = require('globule')
const morph = require('views-morph')
const toCamelCase = require('to-camel-case')
const watch = require('gaze')

function sanitize(input) {
  return basename(input)
    .replace(extname(input), '')
    .replace(/[^a-zA-Z_$0-9]+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '')
    .replace(/^(\d)/, '_$1')
}

module.exports = function views({ as = 'react-dom', exclude, include, extensions = ['.view'], root = process.cwd() } = {}) {
  const filter = createFilter(include, exclude)

  const getStyleImport = `./views-morph/${as}/get-style.js`
  const viewsAction = fs.readFileSync(require.resolve(`views-morph/${as}/Action.js`), 'utf-8')
    .replace('./get-style.js', getStyleImport)
  const viewsGetStyle = fs.readFileSync(require.resolve(`views-morph/${as}/get-style.js`), 'utf-8')
  const viewsTeleport = fs.readFileSync(require.resolve(`views-morph/${as}/Teleport.js`), 'utf-8')
    .replace('./get-style.js', getStyleImport)

  const viewNotFound = name => {
    const warning = `${root}/${name}.view doesn't exist but it is being used. Create the file!`
    console.log(warning)
    return `import React from 'react'; console.warn("${warning}"); export default () => <div>${name} 👻</div>`
  }

  const toViewPath = f => {
    const file = relative(root, f)
    const view = parse(file).name

    return {
      file: `./${file}`,
      view,
    }
  }

  const views = {}
  const addView = f => {
    const { file, view } = toViewPath(f)
    views[view] = file
  }
  // TODO allow these to be defined from outside
  const watcherOptions = {filter: f => !/node_modules/.test(f)}
  const watcherPattern = ['**/*.js', '**/*.view']
  globule.find(watcherPattern, watcherOptions).forEach(addView)
  watch(watcherPattern, watcherOptions, (err, watcher) => {
    if (err) {
      console.error(err)
      return
    }

    // TODO see how we can force a rebuild on rollup when a file gets added/deleted
    watcher.on('added', addView)
    watcher.on('deleted', f => {
      const { view } = toViewPath(f)
      delete views[view]
    })
  })

  return {
    name: 'views',

    load(id) {
      switch (id) {
        case `views-morph/${as}/Action.js`: return viewsAction
        case `views-morph/${as}/get-style.js`: return viewsGetStyle
        case `views-morph/${as}/Teleport.js`: return viewsTeleport
      }

      if (/view-not-found/.test(id)) {
        return viewNotFound(id.split('/')[1])
      }
    },

    resolveId(importee, importer) {
      const commonMatch = importee.match(/(views-morph.+)$/)
      if (commonMatch && commonMatch[1]) {
        return commonMatch[1]
      }

      const match = importee.match(/^\.\/__view__\/(.+)$/)
      if (match && match[1]) {
        return views[match[1]] || `view-not-found/${match[1]}`
      }
    },

    transform(code, id) {
      if (!filter(id)) return null
      if (!~extensions.indexOf(extname(id))) return null

      return morph(code, {
        as,
        name: toCamelCase(sanitize(id)),
        filename: id,
        isInBundler: true,
      });
    }
  }
}
