package blobstore

import (
	"context"
	"errors"
	"testing"
)

func TestFS_PutGetDelete(t *testing.T) {
	store, err := NewFS(t.TempDir())
	if err != nil {
		t.Fatalf("new fs: %v", err)
	}
	ctx := context.Background()
	key := "11111111-1111-1111-1111-111111111111"

	if _, err := store.Get(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	want := Object{Data: []byte("\x89PNG fake bytes"), ContentType: "image/png"}
	if err := store.Put(ctx, key, want); err != nil {
		t.Fatalf("put: %v", err)
	}

	got, err := store.Get(ctx, key)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if string(got.Data) != string(want.Data) || got.ContentType != want.ContentType {
		t.Fatalf("got %q/%s, want %q/%s", got.Data, got.ContentType, want.Data, want.ContentType)
	}

	if err := store.Delete(ctx, key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := store.Get(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
	// Deleting a missing key is not an error.
	if err := store.Delete(ctx, key); err != nil {
		t.Fatalf("delete missing: %v", err)
	}
}

func TestFS_RejectsUnsafeKeys(t *testing.T) {
	store, err := NewFS(t.TempDir())
	if err != nil {
		t.Fatalf("new fs: %v", err)
	}
	for _, bad := range []string{"", "../escape", "a/b", "foo..bar"} {
		if err := store.Put(context.Background(), bad, Object{Data: []byte("x")}); err == nil {
			t.Fatalf("expected key %q to be rejected", bad)
		}
	}
}
