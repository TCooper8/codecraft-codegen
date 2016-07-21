'use strict'

const Util = require('util')

const sprintf = Util.format

// Gather all of the arguments and map them to program configuration keys.
let gatherArgs = argv => {
  let limit = argv.length
  let i = 1
  let acc = { }

  while (++i < limit) {
    let arg = argv[i]
    if (arg === '--node_out') {
      let nodejsOutputPath = argv[++i]
      if (i >= limit) {
        throw new Error('InvalidArgument: Expected output directory for argument \'--node_out\'')
      }

      acc.nodejsOutputPath = nodejsOutputPath

      throw new Error('NodeJS is not supported')
    }
    else if (arg === '--scala_out') {
      let scalaOutputPath = argv[++i]
      if (i >= limit) {
        throw new Error('InvalidArgument: Expected output directory for argument \'--scala_out\'')
      }

      acc.scalaOutputPath = scalaOutputPath
    }
    else if (arg === '--fsharp_out') {
      let fsharpOutputPath = argv[++i]
      if (i >= limit) {
        throw new Error('InvalidArgument: Expected output directory for argument \'--fsharp_out\'')
      }

      acc.fsharpOutputPath = fsharpOutputPath
    }
    else if (arg === '--msgs') {
      acc.genMessages = true
    }
    else if (arg === '--services') {
      acc.genServices = true
    }
    else if (arg === '--routes') {
      acc.genRoutes = true
    }
    else {
      // The last argument is the input path.
      acc.inputPath = argv[i]
    }
  }

  return acc
}

let config = gatherArgs(process.argv)

module.exports = config
