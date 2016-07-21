package codecraft.codegen

import util.Try

final case class EventRegistry(
  key: String,
  exchange: String,
  serialize: Any => Try[Array[Byte]],
  deserialize: Array[Byte] => Try[Any]
)
