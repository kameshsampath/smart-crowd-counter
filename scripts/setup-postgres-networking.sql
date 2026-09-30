-- Postgres networking and secrets (only when using Postgres for GPS metadata)
-- Creates network rules, secrets, external access integration, and network
-- policy for connecting the app to a Snowflake Postgres instance.
--
-- Run after setup-infra.sql and after provisioning the Postgres instance.
-- Requires ACCOUNTADMIN or equivalent privileges.
--
-- ============================================================================
-- PLACEHOLDERS — replace before running:
--   <PG_HOST>           Postgres instance hostname
--                       (e.g., abc123.account.region.aws.postgres.snowflake.app)
--   <PG_USERNAME>       Runtime Postgres username
--   <PG_PASSWORD>       Runtime Postgres password
--   <PG_CA_CERT>        Full PEM text of the Postgres CA certificate
--   <ADMIN_IP>          Your client IP for Postgres admin access (CIDR /32)
--   <SF_EGRESS_CIDR_1>  Snowflake egress CIDR for your region (check docs)
--   <SF_EGRESS_CIDR_2>  Second Snowflake egress CIDR if applicable
-- ============================================================================

USE DATABASE CROWD_COUNTER_DB;
USE SCHEMA CONFERENCES;

-- 1. Egress rule: allow the app to reach the Postgres instance on port 5432.
CREATE NETWORK RULE IF NOT EXISTS SMART_CROWD_COUNTER_EGRESS
  TYPE = HOST_PORT
  MODE = EGRESS
  VALUE_LIST = ('<PG_HOST>:5432');

-- 2. Ingress rule: restrict who can connect to the Postgres instance.
--    Include your admin IP and the Snowflake egress ranges for your region.
CREATE NETWORK RULE IF NOT EXISTS SMART_CROWD_COUNTER_PG_INGRESS
  TYPE = IPV4
  MODE = POSTGRES_INGRESS
  VALUE_LIST = ('<ADMIN_IP>/32', '<SF_EGRESS_CIDR_1>', '<SF_EGRESS_CIDR_2>');

-- 3. Network policy: attach the ingress rule to the Postgres instance.
--    After creating, attach with:
--    ALTER POSTGRES INSTANCE <INSTANCE_NAME>
--      SET NETWORK_POLICY = SMART_CROWD_COUNTER_PG_POLICY;
CREATE NETWORK POLICY IF NOT EXISTS SMART_CROWD_COUNTER_PG_POLICY
  ALLOWED_NETWORK_RULE_LIST = (CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_PG_INGRESS);

-- 4. Secret: Postgres runtime credentials (USERNAME + PASSWORD type).
CREATE OR REPLACE SECRET SMART_CROWD_COUNTER_PG_SECRET
  TYPE = PASSWORD
  USERNAME = '<PG_USERNAME>'
  PASSWORD = '<PG_PASSWORD>';

-- 5. Secret: Postgres CA certificate for TLS verification (GENERIC_STRING type).
--    Paste the full PEM including BEGIN/END lines.
CREATE OR REPLACE SECRET SMART_CROWD_COUNTER_PG_CA
  TYPE = GENERIC_STRING
  SECRET_STRING = '<PG_CA_CERT>';

-- 6. External access integration: combines egress rule with both secrets.
CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION SMART_CROWD_COUNTER_PG_EAI
  ALLOWED_NETWORK_RULES = (CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_EGRESS)
  ALLOWED_AUTHENTICATION_SECRETS = (
    CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_PG_SECRET,
    CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_PG_CA
  )
  ENABLED = TRUE;
