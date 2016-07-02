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

let resolveScalaType = (templateType, imports, namespace, generated) => {
  console.log('resolveScalaType(%j, %j, %s, %s)',
      templateType, imports, namespace)

  let _generated = resolveGenerated(templateType, generated)
  if (_generated !== undefined) {
    return _generated
  }

  if (templateType === 'string') {
    return 'String'
  }
  else if (templateType === 'int') {
    return 'Int'
  }
  else if (templateType === 'list') {
    return 'List'
  }
  else if (templateType === 'option') {
    return 'Option'
  }
  else if (templateType === 'bool') {
    return 'Boolean'
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
      return resolveScalaType(part, imports, namespace, generated)
    }).join(', ')

    // Resolve the outer type and inner template types to scala types.
    return sprintf('%s[%s]', resolveScalaType(outer, imports, namespace, generated), innerResults)
    //return sprintf('%s[%s]', resolveScalaType(outer, imports, namespace, generated), resolveScalaType(inner, imports, namespace, generated))
  }
  else if (templateType.search(' ') !== -1) {
    // This is a nested type.
    let parts = templateType.split(' ')
    //return _.reduce(parts, (acc, part) => {
    return array.fold(acc => part => {
      console.log(
        'parts fold (%s, %s)', acc, part)
      if (acc === undefined) {
        return resolveScalaType(part, imports, namespace, generated)
      }
      return sprintf('%s[%s]', resolveScalaType(part, imports, namespace, generated), acc)
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
      imports.push(sprintf('import %s', resultType))
      return resultClassName
    }
    else {
      return resultClassName
    }
  }
  else {
    throw new Error(sprintf('Cannot resolve scala type for template type %s', templateType))
  }
}

let generated = []

let genScalaClasses = (namespace, template) => {
  console.log(
    'genScalaClasses(%s, %j)',
    namespace,
    template
  )

  let packageDef = sprintf('package %s', namespace)

  let imports = []

  // Generate the class definitions.
  //let classDefinitions = _.map(template, (body, className) => {
  let classDefinitions = monad.object.mapPair((className, body) => {
    //let classDef = _.map(body, (templateType, fieldName) => {

    console.log('Pushing generated %s', className)
    generated.push(className)
    let classDef = monad.object.mapPair((fieldName, templateType) => {
      console.log(
        'classDef object mapPair (%s, %s)',
        fieldName,
        templateType
      )

      return sprintf('\t%s: %s', fieldName, resolveScalaType(templateType, imports, namespace, generated))
    })(body)
    .join(',\n')

    return [
      sprintf('final case class %s(', className),
      classDef,
      ')'
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

let genScalaServices = (namespace, template, moduleName) => {
  let packageDef = sprintf('package %s', namespace)

  let imports = []

  //let serviceDefinitions = _.map(template, (body, serviceName) => {
  let serviceDefinitions = monad.object.mapPair((serviceName, body) => {
    //let registries = _.map(body, (templateType, fieldName) => {
    let registries = monad.object.mapPair((methodName, methodTemplate) => {
      let requestType = resolveScalaType(methodTemplate.request, imports, namespace, generated)
      let responseType = resolveScalaType(methodTemplate.response, imports, namespace, generated)

      let methodDef = sprintf('\tdef %s(cmd: %s): %s', methodName, requestType, responseType)
      let methodRegistry = sprintf('\t\t\"cmd.%s.%s\" -> {\n\t\t\tany => %s(any.asInstanceOf[%s])\n\t\t}', moduleName.toLowerCase(), methodName.toLowerCase(), methodName, requestType)

      return {
        methodDef: methodDef,
        methodRegistry: methodRegistry
      }
    })(body)

    let methodsDef = monad.array.map(pair => pair.methodDef)(registries).join('\n')
    let registriesDef = [
      sprintf('\tval methodRegistry = Map[String, Any => Any]('),
      monad.array.map(pair => pair.methodRegistry)(registries).join(',\n'),
      '\t)'
    ].join('\n')

    imports.push('import codecraft.codegen.CmdGroupConsumer')

    return [
      sprintf('trait %s extends CmdGroupConsumer {', serviceName),
      methodsDef,
      registriesDef,
      '}'
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

let genScalaRouting = (namespace, template, messagesTemplate, moduleName) => {
  let packageDef = sprintf('package %s', namespace)

  let imports = [
    // Using the play json serializer.
    'import play.api.libs.json._',
    sprintf('import %s._', namespace),
    sprintf('import codecraft.codegen._'),
    sprintf('import scala.util.Try')
  ]

  // Populate the object with all of the userstore formatters.
  let formatters = (() => {
    let resolved = { }

    let msgFormatters = monad.object.mapPair((className, body) => {
      if (resolved[className]) return;
      let scalaClassName = resolveScalaType(className, imports, namespace, generated)
      return sprintf('\timplicit val %sFormat = Json.format[%s]', scalaClassName, scalaClassName)
    })(messagesTemplate)

    return _.filter(msgFormatters).join('\n')
  })()
  //let formatters = monad.object.mapPair((className, body) => {
  //  return sprintf('\timplicit val %sFormat = Json.format[%s]', className, className)
  //})(messagesTemplate).join('\n')

  let outerNamespace = (() => {
    let i = namespace.lastIndexOf('.')
    if (i === -1) {
      return namespace
    }

    return namespace.slice(i + 1)
  })()

  let implicitsDef = [
    sprintf('object %sFormatters {', moduleName),
    formatters,
    '}'
  ].join('\n')

  let jsonSerialize = type => {
    return [
      sprintf('\t\t(any: Any) => Try {'),
      sprintf('\t\t\t\tval value = any.asInstanceOf[%s]', type),
      sprintf('\t\t\t\tJson.toJson(value).toString.getBytes'),
      sprintf('\t\t\t}')
    ].join('\n')
  }

  let jsonDeserialize = type => {
    return [
      sprintf('\t\t(bytes: Array[Byte]) => Try {'),
      sprintf('\t\t\t\tval json = Json.parse(new String(bytes))'),
      sprintf('\t\t\t\tJson.fromJson[%s](json) match {', type),
      sprintf('\t\t\t\t\tcase JsError(errors) => throw new Exception(errors mkString)'),
      sprintf('\t\t\t\t\tcase JsSuccess(any, _) => any.asInstanceOf[%s]', type),
      sprintf('\t\t\t\t}'),
      sprintf('\t\t\t}')
    ].join('\n')
  }

  let routingGroupDefs = monad.object.mapPair((serviceName, body) => {
    // Generate the GroupRouting record.
    let groupRoutingRecord = [
      sprintf('\tval groupRouting = GroupRouting('),
      sprintf('\t\t\"cmd.%s\",', moduleName).toLowerCase(),
      sprintf('\t\t\"cmd.%s.*\",', moduleName).toLowerCase(),
      sprintf('\t\t\"cmd\"'),
      sprintf('\t)')
    ].join('\n')

    let cmdInfoRegistries = monad.object.mapPair((methodName, methodTemplate) => {
      console.log('cmdInfoRegistries(%j)', methodTemplate, methodName)
      let requestType = resolveScalaType(methodTemplate.request, imports, namespace, generated)
      let responseType = resolveScalaType(methodTemplate.response, imports, namespace, generated)

      return [
        '\t\tcodecraft.codegen.CmdRegistry(',
        sprintf('\t\t\"cmd.%s.%s\",', moduleName, methodName).replace('\t', '\t\t').toLowerCase(),
        sprintf('%s,', jsonSerialize(requestType)).replace('\t', '\t\t'),
        sprintf('%s,', jsonSerialize(responseType)).replace('\t', '\t\t'),
        sprintf('%s,', jsonDeserialize(requestType)).replace('\t', '\t\t'),
        sprintf('%s,', jsonDeserialize(responseType)).replace('\t', '\t\t'),
        sprintf('\t\t\t%s', 'groupRouting'),
        '\t\t)'
      ].join('\n')

      //return sprintf('\t\tUtils.mkJsonCmdRegistry[%s, %s](\"%s\")', requestType, responseType, methodName)
    })(body).join(',\n')

    let cmdInfoDef = [
      '\tlazy val cmdInfo = List(',
      cmdInfoRegistries,
      '\t)',
      '}'
    ].join('\n')

    return [
      sprintf('object %sRoutingGroup {', moduleName),
      sprintf('\timport %sFormatters._', moduleName),
      groupRoutingRecord,
      cmdInfoDef
    ].join('\n')
  })(template).join('\n\n')

  let importsDef = imports.join('\n')

  return [
    packageDef,
    importsDef,
    implicitsDef,
    routingGroupDefs
  ].join('\n\n')
}

const scalaOut = config.scalaOutputPath

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
    let scalaMessages = genScalaClasses(namespace, template.messages).replace(/\t/g, '  ')
    let fileout = Path.join(scalaOut, filename.replace('.json', 'Messages.scala'))

    let dirpath = Path.resolve('./', Path.dirname(fileout))
    mkdirp.sync(dirpath)

    Fs.writeFileSync(fileout, scalaMessages)
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
    let scalaServices = genScalaServices(namespace, template.services, moduleName).replace(/\t/g, '  ')
    let fileout = Path.join(scalaOut, filename.replace('.json', 'Services.scala'))

    let dirpath = Path.resolve('./', Path.dirname(fileout))
    mkdirp.sync(dirpath)

    Fs.writeFileSync(fileout, scalaServices)
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

    genScalaClasses(namespace, template.messages)
    genScalaServices(namespace, template.services, moduleName)
    let scalaRoutes = genScalaRouting(namespace, template.services, template.messages, moduleName).replace(/\t/g, '  ')
    let fileout = Path.join(scalaOut, filename.replace('.json', 'Routes.scala'))

    let dirpath = Path.resolve('./', Path.dirname(fileout))
    mkdirp.sync(dirpath)

    Fs.writeFileSync(fileout, scalaRoutes)
  })(Fs.readdirSync(routesDir))
}

if (config.genRoutes) {
  console.log('Generating routes...')
  // Load the generated classes.
  genRoutes(config.inputPath)
  console.log('...done')
}
