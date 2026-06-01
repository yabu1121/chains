# --- build stage -----------------------------------------------------------
FROM golang:1.26-alpine AS build
WORKDIR /src

# Download modules first so this layer caches independently of source changes.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Static binaries (CGO disabled). Migrations are embedded via go:embed, so no
# SQL files need to be shipped alongside.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# --- runtime stage ----------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/migrate /app/migrate

ENV HTTP_ADDR=:8080
EXPOSE 8080
USER nonroot:nonroot

# Run migrations as a separate step (docker run --entrypoint /app/migrate ...);
# the default entrypoint just serves the API.
ENTRYPOINT ["/app/api"]
