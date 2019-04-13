const { spawn, spawnSync } = require('child_process')
const { statSync } = require('fs')
const ExeFile = require('c21e')
const { messages, ProtobufMessageStream } = require('cucumber-messages')

function fromPaths(paths, options) {
  return new Gherkin(paths, [], options).messageStream()
}

function fromSources(sources, options) {
  return new Gherkin([], sources, options).messageStream()
}

function dialects() {
  return new Gherkin([], [], {}).dialects()
}

module.exports = {
  dialects,
  fromPaths,
  fromSources,
}

class Gherkin {
  constructor(paths, sources, options) {
    this._paths = paths
    this._sources = sources
    this._options = Object.assign(
      {
        defaultDialect: 'en',
        includeSource: true,
        includeGherkinDocument: true,
        includePickles: true,
      },
      options
    )
    let gherkinGoDir = `${__dirname}/../../gherkin-go`
    try {
      statSync(gherkinGoDir)
    } catch (err) {
      // Dev mode - we're in src, not dist/src
      gherkinGoDir = `${__dirname}/../gherkin-go`
    }
    this._exeFile = new ExeFile(
      `${gherkinGoDir}/gherkin-go-{{.OS}}-{{.Arch}}{{.Ext}}`
    )
  }

  dialects() {
    const result = spawnSync(this._exeFile.fileName, ['--dialects'])
    return JSON.parse(result.stdout)
  }

  messageStream() {
    const options = ['--default-dialect', this._options.defaultDialect]
    if (!this._options.includeSource) options.push('--no-source')
    if (!this._options.includeGherkinDocument) options.push('--no-ast')
    if (!this._options.includePickles) options.push('--no-pickles')
    const args = options.concat(this._paths)
    const gherkin = spawn(this._exeFile.fileName, args)
    const protobufMessageStream = new ProtobufMessageStream(
      messages.Wrapper.decodeDelimited.bind(messages.Wrapper)
    )
    gherkin.on('error', err => {
      protobufMessageStream.emit('error', err)
    })
    gherkin.stdout.pipe(protobufMessageStream)
    for (const source of this._sources) {
      const wrapper = new messages.Wrapper.fromObject({ source })
      gherkin.stdin.write(messages.Wrapper.encodeDelimited(wrapper).finish())
    }
    gherkin.stdin.end()
    return protobufMessageStream
  }
}
