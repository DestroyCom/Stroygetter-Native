.PHONY: install dev build build-frontend test test-frontend test-rust check clean lint

# Install all dependencies (npm + cargo)
install:
	npm install && cd src-tauri && cargo fetch

# Start Tauri in development mode (hot-reload)
dev:
	npm run tauri dev

# Build the full Tauri app for production
build:
	npm run tauri build

# Build only the frontend (Vite)
build-frontend:
	npm run build

# Run all tests (frontend + Rust)
test:
	npm test && cd src-tauri && cargo test

# Run frontend tests only
test-frontend:
	npm test

# Run Rust tests only
test-rust:
	cd src-tauri && cargo test

# Type-check frontend and run cargo check
check:
	npm run build && cd src-tauri && cargo check

# Remove build artifacts
clean:
	rm -rf dist/ src-tauri/target/

# TypeScript type check (no emit)
lint:
	npx tsc --noEmit
