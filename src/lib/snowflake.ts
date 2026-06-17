import snowflake from "snowflake-sdk";
import fs from "fs";
import path from "path";
import os from "os";

let connectionPool: snowflake.Connection | null = null;

interface TomlConnection {
    account?: string;
    user?: string;
    authenticator?: string;
    private_key_file?: string;
    role?: string;
    database?: string;
    schema?: string;
    warehouse?: string;
}

function parseConnectionsToml(
    connectionName: string
): TomlConnection | null {
    // Snowflake CLI uses config.toml; some setups use connections.toml
    const candidates = [
        path.join(os.homedir(), ".snowflake", "connections.toml"),
        path.join(os.homedir(), ".snowflake", "config.toml"),
    ];

    let content: string | null = null;
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            content = fs.readFileSync(candidate, "utf-8");
            break;
        }
    }
    if (!content) return null;

    const section = `[connections.${connectionName}]`;
    const sectionIdx = content.indexOf(section);
    if (sectionIdx === -1) return null;

    const afterSection = content.slice(sectionIdx + section.length);
    const nextSection = afterSection.indexOf("\n[");
    const block =
        nextSection === -1 ? afterSection : afterSection.slice(0, nextSection);

    const result: Record<string, string> = {};
    for (const line of block.split("\n")) {
        const match = line.match(/^\s*(\w+)\s*=\s*"?([^"]*)"?\s*$/);
        if (match) {
            result[match[1]] = match[2];
        }
    }
    return result as unknown as TomlConnection;
}

async function getConnection(): Promise<snowflake.Connection> {
    if (connectionPool) {
        return connectionPool;
    }

    let connection: snowflake.Connection;

    // Deployed mode: read OAuth token from SPCS-injected file
    const tokenPath = "/snowflake/session/token";
    if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, "utf-8").trim();
        connection = snowflake.createConnection({
            account: process.env.SNOWFLAKE_ACCOUNT || "",
            authenticator: "OAUTH",
            token,
            database: process.env.SNOWFLAKE_DATABASE || "CROWD_COUNTER_DB",
            schema: process.env.SNOWFLAKE_SCHEMA || "CONFERENCES",
        });
    } else {
        // Local dev mode: parse connections.toml
        const connectionName =
            process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME || "default";
        const tomlConfig = parseConnectionsToml(connectionName);

        if (!tomlConfig) {
            throw new Error(
                `Connection "${connectionName}" not found in ~/.snowflake/connections.toml`
            );
        }

        const opts: snowflake.ConnectionOptions = {
            account: tomlConfig.account || "",
            username: tomlConfig.user || "",
            role: tomlConfig.role || undefined,
            database:
                process.env.SNOWFLAKE_DATABASE ||
                tomlConfig.database ||
                "CROWD_COUNTER_DB",
            schema: process.env.SNOWFLAKE_SCHEMA || tomlConfig.schema || undefined,
        };

        // Handle authenticator types supported by Node.js SDK
        const auth = (tomlConfig.authenticator || "").toUpperCase();
        if (auth === "SNOWFLAKE_JWT" && tomlConfig.private_key_file) {
            opts.authenticator = "SNOWFLAKE_JWT";
            opts.privateKeyPath = tomlConfig.private_key_file;
        } else if (auth === "EXTERNALBROWSER") {
            opts.authenticator = "EXTERNALBROWSER";
        }

        connection = snowflake.createConnection(opts);
    }

    return new Promise((resolve, reject) => {
        connection.connect((err) => {
            if (err) {
                reject(new Error(`Snowflake connection failed: ${err.message}`));
            } else {
                connectionPool = connection;
                resolve(connection);
            }
        });
    });
}

export interface QueryResult {
    rows: Record<string, unknown>[];
}

export async function querySnowflake(
    sql: string,
    binds?: snowflake.Binds
): Promise<Record<string, unknown>[]> {
    const connection = await getConnection();

    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: sql,
            binds,
            complete: (err, _stmt, rows) => {
                if (err) {
                    reject(new Error(`Query failed: ${err.message}\nSQL: ${sql}`));
                } else {
                    resolve((rows as Record<string, unknown>[]) || []);
                }
            },
        });
    });
}

export async function uploadToStage(
    fileBuffer: Buffer,
    fileName: string,
    stagePath: string
): Promise<void> {
    // Write buffer to a temp file, then PUT to stage
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, fileName);
    fs.writeFileSync(tmpFile, fileBuffer);

    const connection = await getConnection();
    const putSql = `PUT 'file://${tmpFile}' '${stagePath}' AUTO_COMPRESS=FALSE OVERWRITE=TRUE`;

    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: putSql,
            complete: (err) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tmpFile);
                } catch {
                    // ignore cleanup errors
                }

                if (err) {
                    reject(new Error(`Upload failed: ${err.message}`));
                } else {
                    resolve();
                }
            },
        });
    });
}

export function getConfig() {
    return {
        database: process.env.SNOWFLAKE_DATABASE || "CROWD_COUNTER_DB",
        schema: process.env.SNOWFLAKE_SCHEMA || "CONFERENCES",
        stage: process.env.SNOWFLAKE_STAGE || "SNAPS",
        aiModel: process.env.AI_MODEL || "claude-4-sonnet",
    };
}
