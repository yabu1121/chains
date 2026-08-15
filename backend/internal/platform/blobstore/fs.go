package blobstore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// FS stores blobs as files under a base directory: the bytes at <dir>/<key>
// and the content type alongside at <dir>/<key>.type. It stands in for object
// storage (S3/GCS) in local/dev setups behind the same Store interface.
type FS struct {
	dir string
}

// safeKey allows only the characters our keys use (UUIDs) so a key can never
// escape the base directory via path traversal.
var safeKey = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

// NewFS builds a filesystem blob store rooted at dir, creating it if needed.
func NewFS(dir string) (*FS, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &FS{dir: dir}, nil
}

func (f *FS) path(key string) (string, error) {
	if key == "" || !safeKey.MatchString(key) || strings.Contains(key, "..") {
		return "", errors.New("invalid blob key")
	}
	return filepath.Join(f.dir, key), nil
}

func (f *FS) Put(_ context.Context, key string, obj Object) error {
	p, err := f.path(key)
	if err != nil {
		return err
	}
	if err := os.WriteFile(p, obj.Data, 0o644); err != nil {
		return err
	}
	return os.WriteFile(p+".type", []byte(obj.ContentType), 0o644)
}

func (f *FS) Get(_ context.Context, key string) (Object, error) {
	p, err := f.path(key)
	if err != nil {
		return Object{}, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Object{}, ErrNotFound
		}
		return Object{}, err
	}
	ct, err := os.ReadFile(p + ".type")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return Object{}, err
	}
	return Object{Data: data, ContentType: strings.TrimSpace(string(ct))}, nil
}

func (f *FS) Delete(_ context.Context, key string) error {
	p, err := f.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Remove(p + ".type"); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
