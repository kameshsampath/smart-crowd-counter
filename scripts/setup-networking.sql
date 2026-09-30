-- Tile proxy networking (required for all deployments)
-- Creates the egress network rule and external access integration
-- for proxying OpenStreetMap tiles through the app.
--
-- Run after setup-infra.sql. Uses the same database/schema.
-- Requires ACCOUNTADMIN or equivalent privileges.

USE DATABASE CROWD_COUNTER_DB;
USE SCHEMA CONFERENCES;

-- Egress rule: allow the app to reach the canonical OSM tile server.
-- Do not randomize subdomains; tile.openstreetmap.org is the current policy.
CREATE NETWORK RULE IF NOT EXISTS SMART_CROWD_COUNTER_TILES_EGRESS
  TYPE = HOST_PORT
  MODE = EGRESS
  VALUE_LIST = ('tile.openstreetmap.org:443');

-- External access integration referencing the tile egress rule.
-- No secrets needed — OSM tiles are public.
CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION SMART_CROWD_COUNTER_TILES_EAI
  ALLOWED_NETWORK_RULES = (CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_TILES_EGRESS)
  ENABLED = TRUE;
