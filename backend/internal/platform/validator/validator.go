// Package validator adapts go-playground/validator to Echo's Validator
// interface so handlers can call c.Validate(dto).
package validator

import (
	"reflect"
	"sort"
	"strings"

	"github.com/go-playground/validator/v10"

	"github.com/cymed/chains/backend/internal/platform/httperr"
)

// Validator implements echo.Validator.
type Validator struct {
	v *validator.Validate
}

// New builds a Validator.
func New() *Validator {
	v := validator.New(validator.WithRequiredStructEnabled())
	// Report fields by their JSON name so error messages never leak Go struct
	// or field identifiers. `json:"email,omitempty"` -> "email".
	v.RegisterTagNameFunc(func(fld reflect.StructField) string {
		name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
		if name == "-" || name == "" {
			return fld.Name
		}
		return name
	})
	return &Validator{v: v}
}

// Validate returns a 400 domain error when the struct fails validation. The
// public message is built from JSON field names and a friendly rule phrase,
// so internal struct names, Go field names, and raw validator tags never
// reach the client.
func (val *Validator) Validate(i any) error {
	err := val.v.Struct(i)
	if err == nil {
		return nil
	}

	verrs, ok := err.(validator.ValidationErrors)
	if !ok {
		// Non-field error (e.g. invalid input to the validator itself); keep
		// it generic rather than echoing the raw error.
		return httperr.BadRequest("validation_failed", "validation failed")
	}

	msgs := make([]string, 0, len(verrs))
	for _, fe := range verrs {
		msgs = append(msgs, fe.Field()+" "+rulePhrase(fe.Tag(), fe.Param()))
	}
	sort.Strings(msgs)
	return httperr.BadRequest("validation_failed", strings.Join(msgs, "; "))
}

// rulePhrase maps validator tags to human-readable, non-leaking phrases.
func rulePhrase(tag, param string) string {
	switch tag {
	case "required":
		return "is required"
	case "email":
		return "must be a valid email address"
	case "url", "uri":
		return "must be a valid URL"
	case "min":
		if param != "" {
			return "is too short (min " + param + ")"
		}
		return "is too short"
	case "max":
		if param != "" {
			return "is too long (max " + param + ")"
		}
		return "is too long"
	case "len":
		return "has an invalid length"
	case "oneof":
		return "has an unsupported value"
	case "uuid", "uuid4":
		return "must be a valid identifier"
	default:
		return "is invalid"
	}
}
