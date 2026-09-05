//go:build js && wasm

package main

import (
	"encoding/json"
	"syscall/js"
)

func main() {
	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 1 || args[0].Type() != js.TypeString {
			return `{"status":"error","diagnostics":["Expected AILANG source"]}`
		}
		b, _ := json.Marshal(Check(args[0].String()))
		return string(b)
	})
	js.Global().Set("ailangLeakCheck", callback)
	js.Global().Set("ailangLeakReady", true)
	select {}
}
