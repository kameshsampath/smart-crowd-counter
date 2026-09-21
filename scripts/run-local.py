import argparse
import os
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--skill-dir", required=True)
parser.add_argument("--port", default="3101")
args = parser.parse_args()
sys.path.insert(0, str(Path(args.skill_dir) / "scripts"))
import pg_connect

runtime = pg_connect.get_connection("smart_crowd_counter_runtime")
if not runtime or not runtime.get("sslrootcert"):
    raise SystemExit("Runtime profile with a verified CA certificate is required")
environment = {
    **os.environ,
    "SNOWFLAKE_CONNECTION_NAME": "devrel-ent",
    "SNOWFLAKE_DATABASE": "CROWD_COUNTER_DB",
    "SNOWFLAKE_SCHEMA": "CONFERENCES",
    "PGHOST": runtime["host"],
    "SNOWFLAKE_SECRET_PG_CREDENTIALS_USERNAME": runtime["user"],
    "SNOWFLAKE_SECRET_PG_CREDENTIALS_PASSWORD": runtime["password"],
    "SNOWFLAKE_SECRET_PG_CA_SECRET_STRING": Path(runtime["sslrootcert"]).read_text(),
}
raise SystemExit(
    subprocess.call(
        [
            "npm",
            "--prefix",
            str(Path(__file__).resolve().parent.parent),
            "run",
            "start",
            "--",
            "--port",
            args.port,
        ],
        env=environment,
    )
)
