package storage

import (
	"context"
	"fmt"
	"io"

	"cloud.google.com/go/storage"
	"google.golang.org/api/option"
)

type GCSClient struct {
	client     *storage.Client
	bucketName string
}

func NewGCSClient(
	ctx context.Context, client *storage.Client,
	bucketName string, credentialsPath string,
) (*GCSClient, error) {
	var opts []option.ClientOption

	if credentialsPath != "" {
		opts = append(opts, option.WithAuthCredentialsFile(option.ServiceAccount, credentialsPath))
	}

	client, err := storage.NewClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCS client: %w", err)
	}
	return &GCSClient{
		client:     client,
		bucketName: bucketName,
	}, nil
}

func (g *GCSClient) Upload(
	ctx context.Context, objectPath, contentType string, r io.Reader,
) error {
	wc := g.client.Bucket(g.bucketName).Object(objectPath).NewWriter(ctx)
	wc.ContentType = contentType

	if _, err := io.Copy(wc, r); err != nil {
		_ = wc.Close()
		return fmt.Errorf("gcs: failed to copy data to GCS: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("gcs upload: failed to close writer: %w", err)
	}
	return nil
}

func (g *GCSClient) Download(
	ctx context.Context, objectPath string,
) ([]byte, string, error) {
	obj := g.client.Bucket(g.bucketName).Object(objectPath)
	attrs, err := obj.Attrs(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("gcs attrs failed for %q: %w", objectPath, err)
	}
	rc, err := obj.NewReader(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("gcs reader failed for %q: %w", objectPath, err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return nil, "", fmt.Errorf("gcs read failed for %q: %w", objectPath, err)
	}
	return data, attrs.ContentType, nil
}

func (g *GCSClient) Delete(
	ctx context.Context, objectPath string,
) error {
	if err := g.client.Bucket(g.bucketName).Object(objectPath).Delete(ctx); err != nil {
		return fmt.Errorf("gcs delete failed for %q: %w", objectPath, err)
	}
	return nil
}

func (g *GCSClient) Close() error {
	return g.client.Close()
}
