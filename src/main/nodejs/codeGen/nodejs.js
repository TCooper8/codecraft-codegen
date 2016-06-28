'use strict'

const Util = require('util')
const Zedd = require('zedd')

const object = Zedd.object
const sprintf = Util.format

let InvalidTemplateValue = (key, msg) => {
  val errMsg = sprintf(
    'InvalidTemplate: \'%s\' %s',
    msg
  )
  throw new Error(errMsg)
}

let validateRootPackage = rootPackage => {
  val key = 'rootPackage'
  if (rootPackage === undefined) {
    InvalidTemplateValue(key, 'must be defined')
  }
  else if (typeof rootPackage !== 'string') {
    InvalidTemplateValue(key, sprintf(
      'must be a string, but got %s:%s',
      rootPackage,
      typeof rootPackage
    ))
  }

  return rootPackage
}

let InvalidField = (fieldName, msg) => {
  let errMsg = sprintf(
    'InvalidFieldType: \'%s\' %s',
    fieldName,
    msg
  )
  throw new Error(errMsg)
}

let resolveType = (rootPackage, templateType, fieldName, imports) => {
  if (templateType === 'string') {
    return obj => {
      let field = obj[fieldName]
      if (typeof field !== 'string') {
        InvalidField(fieldName, sprintf(
          'expected string but got %s',
          field
        ))
      }

      return field
    }
  }
  else if (templateType === 'int') {
    return obj => {

    }
  }
}

let validateMessages = (rootPackage, messageTemplates) => {
  object.mapPair((name, template) => {
    let fullPath = sprintf('%s.%s', rootPackage, name)
    let fields = object.mapPair((fieldName, fieldTemplate) => {

    })
  })(messageTemplates)
}

let genMessages = template => {
  let rootPackage = validateRootPackage(template.rootPackage)
  let messages = validateMessages(template.messages)
}
