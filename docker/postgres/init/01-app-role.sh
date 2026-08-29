#!/bin/bash
# Crée le rôle applicatif utilisé par Prisma.
#
# Ce script n'est pas un détail d'installation : c'est la condition sans laquelle
# toute l'isolation multi-tenant est inerte.
#
# `20260823020000_add_rls_policies` protège les tables par des policies RLS et
# les force avec `FORCE ROW LEVEL SECURITY`, parce que le propriétaire d'une
# table contourne RLS par défaut. Mais `FORCE` ne s'applique pas aux superusers
# ni aux rôles portant `BYPASSRLS` : ceux-là traversent les policies quoi qu'il
# arrive, silencieusement, sans la moindre erreur. Une application connectée en
# `postgres` verrait donc les données de tous les tenants — exactement le
# scénario que l'audit interdit (docs/AUDIT_V2_MULTI_TENANT.md §276, règle 4).
#
# D'où la séparation des deux rôles :
#   - POSTGRES_USER  : superuser, sert uniquement à l'administration du serveur.
#   - APP_DB_USER    : NOSUPERUSER NOBYPASSRLS, propriétaire de la base, seul
#                      rôle utilisé par l'API. Il exécute aussi les migrations,
#                      ce qui le rend propriétaire des tables — la situation
#                      que le commentaire de la migration RLS décrit.
#
# Ce fichier n'est exécuté qu'à la toute première création du volume PostgreSQL.
# Changer APP_DB_PASSWORD ensuite n'a aucun effet tant que le volume existe.

set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER est obligatoire}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD est obligatoire}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set app_user="$APP_DB_USER" \
  --set app_password="$APP_DB_PASSWORD" \
  --set app_database="$POSTGRES_DB" <<-'EOSQL'
	CREATE ROLE :"app_user" WITH
	  LOGIN
	  PASSWORD :'app_password'
	  NOSUPERUSER
	  NOCREATEDB
	  NOCREATEROLE
	  NOBYPASSRLS
	  INHERIT;

	-- Propriétaire de la base et du schéma : les migrations Prisma tournent sous
	-- ce rôle et doivent pouvoir créer tables, types, fonctions et policies.
	ALTER DATABASE :"app_database" OWNER TO :"app_user";
	ALTER SCHEMA public OWNER TO :"app_user";
	GRANT ALL ON SCHEMA public TO :"app_user";
EOSQL

echo "Rôle applicatif « $APP_DB_USER » créé (NOSUPERUSER, NOBYPASSRLS) — RLS effectif."
