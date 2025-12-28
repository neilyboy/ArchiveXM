.PHONY: dev prod build stop logs clean

# Development mode - hot reloading
dev:
	docker-compose -f docker-compose.dev.yml up --build

# Production mode
prod:
	docker-compose up -d --build

# Build images only
build:
	docker-compose build

# Stop all containers
stop:
	docker-compose down
	docker-compose -f docker-compose.dev.yml down

# View logs
logs:
	docker-compose logs -f

# Clean everything
clean:
	docker-compose down -v --rmi local
	rm -rf data/*.db
	rm -rf downloads/*

# Backend shell
backend-shell:
	docker-compose exec backend /bin/bash

# Frontend shell
frontend-shell:
	docker-compose exec frontend /bin/sh
