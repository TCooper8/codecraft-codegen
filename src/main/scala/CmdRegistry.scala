package codecraft.codegen

import util.Try

final case class GroupRouting(
  queueName: String,
  routingKey: String,
  exchange: String
)

final case class CmdRegistry(
  key: String,
  serializeCmd: Any => Try[Array[Byte]],
  serializeReply: Any => Try[Array[Byte]],
  deserializeCmd: Array[Byte] => Try[Any],
  deserializeReply: Array[Byte] => Try[Any],
  group: GroupRouting
)
