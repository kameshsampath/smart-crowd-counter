import argparse
import secrets
import subprocess
import sys
from pathlib import Path

import psycopg2
from psycopg2 import sql

parser = argparse.ArgumentParser()
parser.add_argument("--skill-dir", required=True)
args = parser.parse_args()
sys.path.insert(0, str(Path(args.skill_dir) / "scripts"))
import pg_connect

admin = pg_connect.get_connection("smart_crowd_counter_pg")
if not admin:
    raise SystemExit("Missing saved administrator connection")
runtime = pg_connect.get_connection("smart_crowd_counter_runtime")
password = runtime["password"] if runtime else secrets.token_urlsafe(48)
try:
    with psycopg2.connect(
        host=admin["host"],
        port=admin["port"],
        dbname=admin["database"],
        user=admin["user"],
        password=admin["password"],
        sslmode="verify-ca",
        sslrootcert=admin["sslrootcert"],
        connect_timeout=10,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM pg_roles WHERE rolname='crowd_counter_runtime'"
            )
            if not cursor.fetchone():
                cursor.execute(
                    sql.SQL(
                        "CREATE ROLE crowd_counter_runtime LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
                    ).format(sql.Literal(password))
                )
            elif not runtime:
                raise RuntimeError(
                    "Runtime role exists without saved credentials; manual reconciliation required"
                )
            cursor.execute(Path(__file__).with_name("setup-locations.sql").read_text())
    pg_connect.save_connection(
        "smart_crowd_counter_runtime",
        {
            **admin,
            "user": "crowd_counter_runtime",
            "password": password,
            "access_roles": [],
        },
    )
    pg_connect.save_service_entry(
        "smart_crowd_counter_runtime",
        {**admin, "user": "crowd_counter_runtime"},
        sslrootcert=admin["sslrootcert"],
    )
    certificate = Path(admin["sslrootcert"]).read_text()

    def literal(value):
        return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"

    statement = (
        "CREATE SECRET IF NOT EXISTS CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_PG_SECRET "
        "TYPE=PASSWORD USERNAME='crowd_counter_runtime' PASSWORD="
        + literal(password)
        + ";"
        "CREATE SECRET IF NOT EXISTS CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER_PG_CA "
        "TYPE=GENERIC_STRING SECRET_STRING=" + literal(certificate) + ";"
    )
    result = subprocess.run(
        [
            "snow",
            "sql",
            "--connection",
            "devrel-ent",
            "--role",
            "ACCOUNTADMIN",
            "--stdin",
            "--silent",
            "--enable-templating",
            "NONE",
        ],
        input=statement,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(
            "Snowflake secret provisioning failed; captured output suppressed to protect credentials"
        )
    print(
        "GPS table, scoped runtime role, saved runtime profile, credential secret and CA secret provisioned."
    )
except Exception as error:
    message = pg_connect.sanitize_error(str(error), admin).replace(
        password, "[REDACTED]"
    )
    print(
        "Provisioning failed: " + type(error).__name__ + ": " + message, file=sys.stderr
    )
    raise SystemExit(1)
