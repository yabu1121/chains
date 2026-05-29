// Package httperr provides a small domain-error type that feature slices can
// return without importing Echo, plus a central Echo error handler that maps
// those errors (and Echo/validation errors) to a consistent JSON shape.
package httperr

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
)

// Error is a domain error carrying an HTTP status and a stable machine code.
type Error struct {
	Status  int
	Code    string
	Message string
	err     error // optional wrapped cause
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.err }

// New builds a domain error.
func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

// Wrap attaches an underlying cause for logging while keeping the public shape.
func (e *Error) Wrap(err error) *Error {
	clone := *e
	clone.err = err
	return &clone
}

// Common constructors.
func BadRequest(code, msg string) *Error   { return New(http.StatusBadRequest, code, msg) }
func Unauthorized(code, msg string) *Error { return New(http.StatusUnauthorized, code, msg) }
func Forbidden(code, msg string) *Error    { return New(http.StatusForbidden, code, msg) }
func NotFound(code, msg string) *Error     { return New(http.StatusNotFound, code, msg) }
func Conflict(code, msg string) *Error     { return New(http.StatusConflict, code, msg) }
func Internal(msg string) *Error           { return New(http.StatusInternalServerError, "internal", msg) }

type body struct {
	Error responseError `json:"error"`
}

type responseError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Handler is an echo.HTTPErrorHandler that renders every error as
// {"error":{"code":"...","message":"..."}}.
func Handler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	var (
		status = http.StatusInternalServerError
		code   = "internal"
		msg    = "internal server error"
	)

	var appErr *Error
	var echoErr *echo.HTTPError
	switch {
	case errors.As(err, &appErr):
		status, code, msg = appErr.Status, appErr.Code, appErr.Message
	case errors.As(err, &echoErr):
		status = echoErr.Code
		code = http.StatusText(status)
		if m, ok := echoErr.Message.(string); ok {
			msg = m
		} else {
			msg = http.StatusText(status)
		}
	}

	_ = c.JSON(status, body{Error: responseError{Code: code, Message: msg}})
}
