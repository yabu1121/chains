// Package blobstore abstracts where binary objects (currently avatar images)
// are stored, so the feature code does not hardcode PostgreSQL. A Postgres
// implementation keeps the existing behaviour; a filesystem implementation
// stands in for object storage locally, and a production S3/GCS implementation
// can be added behind the same interface without touching callers.
package blobstore

import (
	"context"
	"errors"
)

// ErrNotFound is returned by Get/Delete when the key has no object.
var ErrNotFound = errors.New("blob not found")

// Object is a stored blob and its content type.
type Object struct {
	Data        []byte
	ContentType string
}

// Store is a minimal key/value object store.
type Store interface {
	// Put stores (or replaces) the object at key.
	Put(ctx context.Context, key string, obj Object) error
	// Get returns the object at key, or ErrNotFound.
	Get(ctx context.Context, key string) (Object, error)
	// Delete removes the object at key. Missing keys are not an error.
	Delete(ctx context.Context, key string) error
}
