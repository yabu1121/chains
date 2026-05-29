.PHONY: help infra-up infra-down backend-run backend-dev backend-test backend-tidy backend-vet frontend-install frontend-dev frontend-build

help:
	@echo "Chains — make targets:"
	@echo "  infra-up         start PostgreSQL + Redis via docker compose"
	@echo "  infra-down       stop infrastructure"
	@echo "  backend-run      run the Go API against PostgreSQL+Redis from infra-up"
	@echo "  backend-dev      run the Go API on an embedded PostgreSQL (no Docker needed)"
	@echo "  backend-test     run all Go tests (embedded postgres + miniredis)"
	@echo "  backend-tidy     go mod tidy"
	@echo "  backend-vet      go vet ./..."
	@echo "  frontend-install npm install in frontend"
	@echo "  frontend-dev     run Next.js dev server"
	@echo "  frontend-build   build the Next.js app"

infra-up:
	docker compose up -d

infra-down:
	docker compose down

backend-run:
	cd backend && go run ./cmd/api

backend-dev:
	cd backend && go run ./cmd/devserver

backend-test:
	cd backend && go test ./...

backend-tidy:
	cd backend && go mod tidy

backend-vet:
	cd backend && go vet ./...

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
