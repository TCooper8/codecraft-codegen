'use strict'

const _ = require('lodash')
const Fs = require('fs')
const Path = require('path')
const Zedd = require('codecraft-zedd')
const config = require('../config')
const Util = require('util')
const mkdirp = require('mkdirp')

const monad = Zedd.monad
const sprintf = Util.format
const array = monad.array

let resolveGenerated = (templateType, generated) => {
  console.log('generated = %j', generated)
  var limit = generated.length
  var i = -1

  while (++i < limit) {
    if (generated[i] === templateType) {
      return generated[i]
    }
  }

  return undefined
}

let resolveFsharpType = (templateType, imports, namespace, generated) => {
  console.log('resolveFsharpType(%j, %j, %s, %s)',
      templateType, imports, namespace)

  let _generated = resolveGenerated(templateType, generated)
  if (_generated !== undefined) {
    return _generated
  }

  if (templateType === 'string') {
    return 'string'
  }
  else if (templateType === 'int') {
    return 'int'
  }
  else if (templateType === 'list') {
    return 'list'
  }
  else if (templateType === 'option') {
    return 'option'
  }
  else if (templateType === 'bool') {
    return 'bool'
  }
  else if (templateType === 'map') {
    return 'Map'
  }
  else if (templateType.indexOf('[') !== -1) {
    // Get the outer type name.
    let outerI = templateType.indexOf('[')
    let outer = templateType.slice(0, outerI)

    // Get the inner type name.
    let innerI = templateType.lastIndexOf(']')
    let inner = templateType.slice(outerI + 1, innerI)
    let innerParts = _.map(inner.split(','), part => part.trim())
    let innerResults = _.map(innerParts, part => {
      return resolveFsharpType(part, imports, namespace, generated)
    }).join(', ')

    // Resolve the outer type and inner template types to fsharp types.
    return sprintf('%s<%s>', resolveFsharpType(outer, imports, namespace, generated), innerResults)
    //return sprintf('%s[%s]', resolveFsharpType(outer, imports, namespace, generated), resolveFsharpType(inner, imports, namespace, generated))
  }
  else if (templateType.search(' ') !== -1) {
    // This is a nested type.
    let parts = templateType.split(' ')
    //return _.reduce(parts, (acc, part) => {
    return array.fold(acc => part => {
      console.log(
        'parts fold (%s, %s)', acc, part)
      if (acc === undefined) {
        return resolveFsharpType(part, imports, namespace, generated)
      }
      return sprintf('%s<%s>', resolveFsharpType(part, imports, namespace, generated), acc)
    })(undefined)(parts)
    //}, undefined)
  }
  else if (templateType.indexOf('${') !== -1) {
    // This is an interpolated type from the templates.
    let templateIndexBegin = templateType.indexOf('${')
    let templateIndexEnd = templateType.indexOf('}')
    let templatePackage = templateType.slice(templateIndexBegin + 2, templateIndexEnd)

    let resultPackage = templatePackage
    let resultClassName = templateType.slice(templateIndexEnd + 2)

    // Add this to the imports.
    if (resultPackage !== namespace) {
      let resultType = sprintf('%s.%s', resultPackage, resultClassName)
      imports.push(sprintf('open %s', resultPackage))
      return resultClassName
    }
    else {
      return resultClassName
    }
  }
  else {
    throw new Error(sprintf('Cannot resolve fsharp type for template type %s', templateType))
  }
}

let generated = []

let genFsharpClasses = (namespace, template) => {
  console.log(
    'genFsharpClasses(%s, %j)',
    namespace,
    template
  )

  let packageDef = sprintf('namespace %s', namespace)

  let imports = []

  // Generate the class definitions.
  //let classDefinitions = _.map(template, (body, className) => {
  let classDefinitions = monad.object.mapPair((className, body) => {
    //let classDef = _.map(body, (templateType, fieldName) => {

    console.log('Pushing generated %s', className)
    generated.push(className)
    let classDef = _.map(body, (templateType, fieldName) => {
      console.log(
        'classDef object mapPair (%s, %s)',
        fieldName,
        templateType
      )

      return sprintf('\t%s: %s', fieldName, resolveFsharpType(templateType, imports, namespace, generated))
    }).join('\n')

    return [
      sprintf('type %s = {', className),
      classDef,
      '}'
    ].join('\n')
  })(template)
  .join('\n\n')

  let importsDef = imports.join('\n')

  return [
    packageDef,
    importsDef,
    classDefinitions
  ]
  .join('\n\n')
}

let genFsharpServices = (namespace, template, moduleName) => {
  let packageDef = sprintf('namespace %s', namespace)

  let imports = []

  //let serviceDefinitions = _.map(template, (body, serviceName) => {
  let serviceDefinitions = monad.object.mapPair((serviceName, body) => {
    //let registries = _.map(body, (templateType, fieldName) => {
    let registries = monad.object.mapPair((methodName, methodTemplate) => {
      let requestType = resolveFsharpType(methodTemplate.request, imports, namespace, generated)
      let responseType = resolveFsharpType(methodTemplate.response, imports, namespace, generated)

      let methodDef = sprintf('\tabstract member %s: %s -> %s', methodName, requestType, responseType)
      //let methodDef = sprintf('\tmember this.%s(cmd: %s): %s', methodName, requestType, responseType)

      //let methodRegistry = sprintf('\t\t\"cmd.%s.%s\" -> {\n\t\t\tany => %s(any.asInstanceOf[%s])\n\t\t}', moduleName.toLowerCase(), methodName.toLowerCase(), methodName, requestType)
      let methodRegistry = sprintf('\t\t\t(\"cmd.%s.%s\", fun (any: obj) -> this.%s(any :?> %s) :> obj)', moduleName.toLowerCase(), methodName.toLowerCase(), methodName, requestType)

      return {
        methodDef: methodDef,
        methodRegistry: methodRegistry
      }
    })(body)

    let methodsDef = monad.array.map(pair => pair.methodDef)(registries).join('\n')
    let registriesDef = [
      sprintf('\tMap<string, obj -> obj> ['),
      //sprintf('\tval methodRegistry = Map[String, Any => Any]('),
      _.map(registries, pair => pair.methodRegistry).join('\n'),
      //monad.array.map(pair => pair.methodRegistry)(registries).join(',\n'),
      '\t\t]'
    ].join('\n')

    imports.push('open codecraft.codegen')
    //imports.push('import codecraft.codegen.CmdGroupConsumer')

    return [
      sprintf('[<AbstractClass>]'),
      sprintf('type %s () =', serviceName),
      sprintf('\tinherit CmdGroupConsumer()'),
      sprintf('\toverride this.methodRegistry = %s', registriesDef),
      methodsDef + '\n'
    ]
    .join('\n')
  })(template)
  .join('\n\n')

  let importsDef = imports.join('\n')

  return [
    packageDef,
    importsDef,
    serviceDefinitions
  ]
  .join('\n\n')
}

let genFsharpRouting = (namespace, template, messagesTemplate, moduleName) => {
  let packageDef = sprintf('namespace %s', namespace)

  let imports = [
    'open System',
    'open System.Text',
    'open Newtonsoft.Json',
    sprintf('open %s', namespace),
    sprintf('open codecraft.codegen'),
    sprintf('open Newtonsoft.Json.Converters')
  ]

  let jsonSettings = [
    '\tlet jsonSettings = new IdiomaticDuConverter()'
  ].join('\n')

  let outerNamespace = (() => {
    let i = namespace.lastIndexOf('.')
    if (i === -1) {
      return namespace
    }

    return namespace.slice(i + 1)
  })()

  let jsonSerialize = type => {
    return [
      sprintf('fun (any: obj) -> ('),
      sprintf('\t\t\t\ttry JsonConvert.SerializeObject(any :?> %s, jsonSettings) |> enc.GetBytes |> Choice1Of2', type),
      sprintf('\t\t\t\twith e -> e |> Choice2Of2'),
      sprintf('\t\t\t)')
    ].join('\n')
  }

  let jsonDeserialize = type => {
    return [
      sprintf('fun (bytes: byte array) -> ('),
      sprintf('\t\t\t\ttry'),
      sprintf('\t\t\t\t\tlet data = bytes |> enc.GetString'),
      sprintf('\t\t\t\t\tJsonConvert.DeserializeObject<%s>(data, jsonSettings) :> obj |> Choice1Of2', type),
      sprintf('\t\t\t\twith e -> e |> Choice2Of2'),
      sprintf('\t\t\t)')
    ].join('\n')
  }

  let routingGroupDefs = monad.object.mapPair((serviceName, body) => {
    // Generate the GroupRouting record.
    let groupRoutingRecord = [
      sprintf('\tlet groupRouting = {'),
      sprintf('\t\tqueueName = \"cmd.%s\"', moduleName.toLowerCase()),
      sprintf('\t\troutingKey = \"cmd.%s.*\"', moduleName.toLowerCase()),
      sprintf('\t\texchange = \"cmd\"'),
      sprintf('\t}')
    ].join('\n')

    let cmdInfoRegistries = monad.object.mapPair((methodName, methodTemplate) => {
      console.log('cmdInfoRegistries(%j)', methodTemplate, methodName)
      let requestType = resolveFsharpType(methodTemplate.request, imports, namespace, generated)
      let responseType = resolveFsharpType(methodTemplate.response, imports, namespace, generated)

      return [
        sprintf('\t\t{'),
        sprintf('\t\t\t%s = \"cmd.%s.%s\";', 'key', moduleName, methodName).toLowerCase(),
        sprintf('\t\t\t%s = %s;', 'serializeCmd', jsonSerialize(requestType)),
        sprintf('\t\t\t%s = %s;', 'serializeReply', jsonSerialize(responseType)),
        sprintf('\t\t\t%s = %s;', 'deserializeCmd', jsonDeserialize(requestType)),
        sprintf('\t\t\t%s = %s;', 'deserializeReply', jsonDeserialize(responseType)),
        sprintf('\t\t\t%s = %s;', 'group', 'groupRouting'),
        sprintf('\t\t}')
      ].join('\n')
    })(body).join(';\n')

    let cmdInfoDef = [
      '\tlet cmdInfo = [',
      cmdInfoRegistries,
      '\t]'
    ].join('\n')

    return [
      sprintf('module %sRoutingGroup =', moduleName),
      sprintf('\tlet enc = Encoding.UTF8'),
      jsonSettings,
      groupRoutingRecord,
      cmdInfoDef
    ].join('\n')
  })(template).join('\n\n')

  let importsDef = imports.join('\n')

  return [
    packageDef,
    importsDef,
    routingGroupDefs
  ].join('\n\n')
}

const fsharpOut = config.fsharpOutputPath

let genMessages = messagesDir => {
  monad.array.each(filename => {
    let filepath = Path.resolve(messagesDir, filename)
    if (filename.endsWith('.swp')) {
      return;
    }

    let stats = Fs.lstatSync(filepath)

    if (!stats.isFile()) {
      return
    }

    console.log('Generating messages for %s', filepath)

    let template = JSON.parse(Fs.readFileSync(filepath))
    let namespace = template.namespace
    let fsharpMessages = genFsharpClasses(namespace, template.messages).replace(/\t/g, '  ')
    let fileout = Path.join(fsharpOut, filename.replace('.json', 'Messages.fs'))

    let dirpath = Path.resolve('./', Path.dirname(fileout))
    mkdirp.sync(dirpath)

    Fs.writeFileSync(fileout, fsharpMessages)
  })(Fs.readdirSync(messagesDir))
}
if (config.genMessages) {
  genMessages(config.inputPath)
}

let genServices = servicesDir => {
  monad.array.each(filename => {
    let filepath = Path.resolve(servicesDir, filename)
    if (filepath.endsWith('.swp')) {
      return;
    }

    let stats = Fs.lstatSync(filepath)
    if (!stats.isFile()) {
      return;
    }

    console.log('Generating services for %s', filepath)

    let moduleName = Path.basename(filename).replace(Path.extname(filename), '')
    let template = JSON.parse(Fs.readFileSync(filepath))
    let namespace = template.namespace
    let fsharpServices = genFsharpServices(namespace, template.services, moduleName).replace(/\t/g, '  ')
    let fileout = Path.join(fsharpOut, filename.replace('.json', 'Services.fs'))

    let dirpath = Path.resolve('./', Path.dirname(fileout))
    mkdirp.sync(dirpath)

    Fs.writeFileSync(fileout, fsharpServices)
  })(Fs.readdirSync(servicesDir))
}

if (config.genServices) {
  genServices(config.inputPath)
}

let genRoutes = routesDir => {
  monad.array.each(filename => {
    let filepath = Path.resolve(routesDir, filename)
    if (filepath.endsWith('.swp')) {
      return;
    }

    let stats = Fs.lstatSync(filepath)
    if (!stats.isFile()) {
      return;
    }

    console.log('Generating routes for %s', filepath)

    let moduleName = Path.basename(filename).replace(Path.extname(filename), '')
    let template = JSON.parse(Fs.readFileSync(filepath))
    let namespace = template.namespace

    genFsharpClasses(namespace, template.messages)
    genFsharpServices(namespace, template.services, moduleName)
    let fsharpRoutes = genFsharpRouting(namespace, template.services, template.messages, moduleName).replace(/\t/g, '  ')
    let fileout = Path.join(fsharpOut, filename.replace('.json', 'Routes.fs'))

    let dirpath = Path.resolve('./', Path.dirname(fileout))
    mkdirp.sync(dirpath)

    Fs.writeFileSync(fileout, fsharpRoutes)
  })(Fs.readdirSync(routesDir))
}

if (config.genRoutes) {
  console.log('Generating routes...')
  // Load the generated classes.
  genRoutes(config.inputPath)
  console.log('...done')
}
