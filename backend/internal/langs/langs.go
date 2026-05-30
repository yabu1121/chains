// Package langs holds the canonical set of programming languages a user can
// list on their profile. Keeping it server-side lets us validate and normalise
// stored values (e.g. "go" -> "Go") so that filtering by language matches
// exactly. The list must stay in sync with the frontend's
// frontend/src/lib/languages.ts.
package langs

import "strings"

// list is the canonical display form of every selectable language, in the
// order shown to users. Lookups are case-insensitive (see canonical).
var list = []string{
	"Go",
	"TypeScript",
	"JavaScript",
	"Python",
	"Java",
	"C",
	"C++",
	"C#",
	"Ruby",
	"PHP",
	"Swift",
	"Kotlin",
	"Rust",
	"Scala",
	"Dart",
	"Elixir",
	"Erlang",
	"Haskell",
	"Clojure",
	"F#",
	"Objective-C",
	"R",
	"Julia",
	"MATLAB",
	"Perl",
	"Lua",
	"Groovy",
	"Shell",
	"PowerShell",
	"SQL",
	"HTML",
	"CSS",
	"Solidity",
	"Zig",
	"Nim",
	"OCaml",
	"Crystal",
	"Visual Basic",
	"Assembly",
	"COBOL",
	"Fortran",
	"Scheme",
	"Common Lisp",
}

// byLower maps the lower-cased name to its canonical display form.
var byLower = func() map[string]string {
	m := make(map[string]string, len(list))
	for _, l := range list {
		m[strings.ToLower(l)] = l
	}
	return m
}()

// Canonical returns the canonical display form of a language name (matched
// case-insensitively, surrounding whitespace ignored) and whether it is a known
// language.
func Canonical(name string) (string, bool) {
	c, ok := byLower[strings.ToLower(strings.TrimSpace(name))]
	return c, ok
}

// All returns the canonical language list in display order.
func All() []string {
	out := make([]string, len(list))
	copy(out, list)
	return out
}
