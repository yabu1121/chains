// Package validator adapts go-playground/validator to Echo's Validator
// interface so handlers can call c.Validate(dto).
package validator

import (
	"github.com/go-playground/validator/v10"

	"github.com/cymed/chains/backend/internal/platform/httperr"
)

// Validator implements echo.Validator.
type Validator struct {
	v *validator.Validate
}

// New builds a Validator.
func New() *Validator {
	return &Validator{v: validator.New(validator.WithRequiredStructEnabled())}
}

// Validate returns a 400 domain error when the struct fails validation.
func (val *Validator) Validate(i any) error {
	if err := val.v.Struct(i); err != nil {
		return httperr.BadRequest("validation_failed", err.Error())
	}
	return nil
}
