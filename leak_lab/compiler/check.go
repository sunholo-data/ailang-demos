package main

import (
	"fmt"
	"github.com/sunholo-data/ailang/internal/lexer"
	"github.com/sunholo-data/ailang/internal/parser"
	"github.com/sunholo-data/ailang/internal/repl"
	"github.com/sunholo-data/ailang/internal/types"
)

type Verdict struct {
	Status      string   `json:"status"`
	Diagnostics []string `json:"diagnostics"`
	Declassify  bool     `json:"declassify"`
	Version     string   `json:"version"`
}

// Check uses the same IFC pass as the CLI. Stock REPL LoadModule currently
// omits that pass. We never evaluate exports or resolve a real secret.
func Check(source string) (out Verdict) {
	out = Verdict{Status: "invalid", Diagnostics: []string{}, Version: "v0.35.0"}
	defer func() {
		if r := recover(); r != nil {
			out.Status = "error"
			out.Diagnostics = []string{fmt.Sprintf("Compiler error: %v", r)}
		}
	}()
	if len(source) > 16000 {
		out.Diagnostics = append(out.Diagnostics, "Keep the experiment under 16,000 bytes.")
		return
	}
	p := parser.New(lexer.New(source, "leak_lab/experiment.ail"))
	program := p.Parse()
	if len(p.Errors()) > 0 {
		for _, e := range p.Errors() {
			out.Diagnostics = append(out.Diagnostics, e.Error())
		}
		return
	}
	if program.File == nil || program.File.Module == nil {
		out.Diagnostics = append(out.Diagnostics, "Include a module declaration.")
		return
	}
	if len(program.File.Imports) > 0 {
		out.Diagnostics = append(out.Diagnostics, "This lab checks a single module without imports. Keep the source, helpers and sink together.")
		return
	}
	if len(program.File.Statements) > 0 {
		out.Diagnostics = append(out.Diagnostics, "This static lab accepts function declarations only. Put values and expressions inside functions.")
		return
	}
	for _, f := range program.File.Funcs {
		for _, e := range f.Effects {
			if e.Name == "Declassify" {
				out.Declassify = true
			}
		}
	}
	// Type errors and IFC violations are different outcomes; neither executes code.
	registry := repl.NewModuleRegistry()
	if _, err := registry.LoadModule(program.File.Module.Path, source); err != nil {
		out.Diagnostics = append(out.Diagnostics, err.Error())
		return
	}
	if errs := types.CheckModuleIFC(program.File); len(errs) > 0 {
		out.Status = "blocked"
		for _, err := range errs {
			out.Diagnostics = append(out.Diagnostics, err.Error())
		}
		return
	}
	out.Status = "allowed"
	return
}
