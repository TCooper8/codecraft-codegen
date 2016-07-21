'use strict'

const config = require('../config')

if (config.scalaOutputPath) {
  require('./scala')
}
if (config.fsharpOutputPath) {
  require('./fsharp')
}

