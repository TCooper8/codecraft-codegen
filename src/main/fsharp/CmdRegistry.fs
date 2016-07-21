namespace codecraft.codegen

type 'a Try = Choice<'a, exn>

type GroupRouting = {
  queueName: string
  routingKey: string
  exchange: string
}

type CmdRegistry = {
  key: string
  serializeCmd: obj -> byte array Try
  serializeReply: obj -> byte array Try
  deserializeCmd: byte array -> obj Try
  deserializeReply: byte array -> obj Try
  group: GroupRouting
}

type EventRegistry = {
  key: string
  serialize: obj -> byte array Try
  deserialize: byte array -> obj Try
  group: GroupRouting
}
