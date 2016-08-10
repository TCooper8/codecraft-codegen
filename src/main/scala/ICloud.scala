package codecraft.codegen

import scala.util.Try
import scala.concurrent.Future
import play.api.libs.json._
import scala.util.{Failure, Success, Try}

final case class CmdInfo(
  serviceKey: String,
  method: String,
  serializeCmd: Any => Try[Array[Byte]],
  serializeReply: Any => Try[Array[Byte]],
  deserializeCmd: Array[Byte] => Try[Any],
  deserializeReply: Array[Byte] => Try[Any]
)

final case class EventInfo(
  namespace: String,
  eventKey: String,
  serialize: Any => Try[Array[Byte]],
  deserialize: Array[Byte] => Try[Any]
)

final case class ServiceInfo(
  serviceKey: String,
  cmdInfo: Map[String, CmdInfo]
)

trait CmdConsumer {
  val id = java.util.UUID.randomUUID.toString
  val serviceInfo: ServiceInfo
  val methodRegistry: Map[String, Any => Any]
}

trait CloudInterface {
  def serviceOf(handler: CmdConsumer): Future[Unit]
  def cmd[A, B](cmdInfo: CmdInfo, msg: A): Future[B]
  def onEvent[A](eventInfo: EventInfo, handler: A => Unit): Unit
  def event(eventInfo: EventInfo, event: Any): Unit
}

object GenUtils {
  def toBytes[A](obj: A)(implicit format: Format[A]): Try[Array[Byte]] = Try {
    Json.toJson(obj).toString.getBytes
  }

  def fromBytes[A](bytes: Array[Byte])(implicit format: Format[A]): Try[A] = {
    Json.parse(new String(bytes)).validate[A].fold(
      errs => {
        val err = JsError.toJson(errs).toString
        val exn = new Exception(err)
        Failure(exn)
      },
      result => {
        Success(result)
      }
    )
  }
}
