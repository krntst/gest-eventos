DB_PATH ?= data/fluxodc.sqlite

.PHONY: db-init db-test db-events db-eventos db-shell app

db-init:
	mkdir -p data
	sqlite3 "$(DB_PATH)" < db/schema.sql
	sqlite3 "$(DB_PATH)" < db/seed.sql
	@echo "Banco local pronto em $(DB_PATH)"

db-test:
	mkdir -p data
	sqlite3 "$(DB_PATH)" < db/schema.sql
	sqlite3 "$(DB_PATH)" < db/seed.sql
	sqlite3 "$(DB_PATH)" < db/test.sql

db-events:
	sqlite3 -header -column "$(DB_PATH)" "SELECT e.id, e.official_name, e.event_date, e.start_time, e.status, u.name AS responsavel FROM events e JOIN users u ON u.id = e.lead_user_id ORDER BY e.event_date;"

db-eventos: db-events

db-shell:
	sqlite3 "$(DB_PATH)"

app:
	node --no-warnings server.js
