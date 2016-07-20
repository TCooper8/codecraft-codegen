namespace codecraft.codegen

open System

[<AbstractClass>]
type CmdGroupConsumer () =
  abstract member methodRegistry: Map<string, obj -> obj>
  abstract member onError: exn -> unit

  member this.id = Guid.NewGuid().ToString()
