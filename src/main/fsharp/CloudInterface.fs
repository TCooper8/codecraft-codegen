namespace codecraft.codegen

open System

type 'a Try =
  | Success of 'a
  | Failure of exn
with
  static member recover (mapping: exn -> 'a) maybe =
    match maybe with
    | Failure e ->
      try mapping e |> Success
      with e -> Failure e
    | a -> a

  static member map mapping maybe =
    match maybe with
    | Success a ->
      try mapping a |> Success
      with e -> Failure e
    | Failure e -> Failure e

type CmdInfo = {
  serviceKey: string
  methodKey: string
  serializeCmd: obj -> byte array Try
  serializeReply: obj -> byte array Try
  deserializeCmd: byte array -> obj Try
  deserializeReply: byte array -> obj Try
}

type EventInfo = {
  namespaceKey: string
  eventKey: string
  serialize: obj -> byte array Try
  deserialize: byte array -> obj Try
}

type ServiceInfo = {
  serviceKey: string
  cmdInfo: Map<string, CmdInfo>
}

[<AbstractClass>]
type CmdConsumer() =
  member this.id = Guid.NewGuid().ToString()
  abstract member serviceInfo: ServiceInfo
  abstract member methodRegistry: Map<string, obj -> obj>

[<Interface>]
type CloudInterface =
  abstract member serviceOf
