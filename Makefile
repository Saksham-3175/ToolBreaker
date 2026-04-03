.PHONY: up attack logs clean

up:
	docker compose up -d target proxy dashboard

attack:
	docker compose --profile attack run --rm engine

logs:
	docker compose logs -f

clean:
	docker compose down -v
