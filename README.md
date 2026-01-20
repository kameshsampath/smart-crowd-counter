# Smart Crowd Counter

A Streamlit app that counts people in conference session photos using Snowflake Cortex AISQL. It detects raised hands too, which is handy for tracking badge giveaways or audience engagement.

## What it does

- Counts attendees in uploaded photos
- Detects raised hands
- Shows conversion rates (hands up vs total people)
- Displays images with interactive analytics

## Tech Stack

- [Snowflake Cortex AISQL](https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql) for image analysis
- [Streamlit in Snowflake](https://docs.snowflake.com/en/developer-guide/streamlit/about-streamlit) for the app
- [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli) for setup automation
- Python, Altair for charts

## Prerequisites

- Snowflake account with Cortex AISQL enabled ([sign up here](https://signup.snowflake.com/) if you don't have one)
- [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/installation/installation) installed and configured
- [Task](https://taskfile.dev/installation/) (optional, for automation)

## Setup

### 1. Configure Environment

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` with your Snowflake connection details:

```bash
# Snowflake Connection
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USER=your_username
SNOWFLAKE_ROLE=your_role
SNOWFLAKE_WAREHOUSE=your_warehouse

# Application Configuration
SNOWFLAKE_DATABASE=CROWD_COUNTER_DB
SNOWFLAKE_SCHEMA=CONFERENCES
SNOWFLAKE_STAGE=SNAPS

# AI Model
AI_MODEL=claude-4-sonnet
```

### 2. Run Setup

Choose one of the following methods:

#### Option A: Using Task (recommended)

```bash
# Verify Snowflake CLI connection
task snow:check

# Preview rendered SQL (dry run)
task snow:setup:dry-run

# Create all Snowflake objects
task snow:setup
```

#### Option B: Using Snowflake CLI

The setup script uses [Jinja2 templating](https://docs.snowflake.com/en/sql-reference/sql/execute-immediate-from#jinja2-templating) for variable substitution:

```bash
snow sql -f setup.sql --templating=ALL \
  -D database=CROWD_COUNTER_DB \
  -D schema=CONFERENCES \
  -D stage=SNAPS \
  -D ai_model=claude-4-sonnet
```

#### Option C: Using Snowflake Workspaces (No CLI required)

If you prefer working directly in Snowflake's UI without installing any CLI tools:

1. Open [Snowsight](https://app.snowflake.com) and navigate to **Worksheets**
2. Create a new SQL Worksheet in your [Workspace](https://docs.snowflake.com/en/user-guide/ui-snowsight/workspaces)
3. Copy the contents of `setup.sql` into the worksheet
4. Replace the Jinja2 variables with your values:
   - `{{ db }}` → `CROWD_COUNTER_DB` (or your database name)
   - `{{ sch }}` → `CONFERENCES` (or your schema name)
   - `{{ stg }}` → `SNAPS` (or your stage name)
   - `{{ model }}` → `claude-4-sonnet` (or your preferred model)
5. Run all statements (Ctrl/Cmd + Shift + Enter)

> **Tip:** Use Find and Replace (Ctrl/Cmd + H) to quickly substitute all variables.

#### Option D: Using EXECUTE IMMEDIATE FROM

Upload `setup.sql` to a stage, then run:

```sql
EXECUTE IMMEDIATE FROM @my_stage/setup.sql
  USING (database => 'CROWD_COUNTER_DB',
         schema => 'CONFERENCES',
         stage => 'SNAPS',
         ai_model => 'claude-4-sonnet');
```

### 3. Deploy the App

Upload `app.py` to your Snowflake environment and create a Streamlit app using Snowflake's native Streamlit support.

## Usage

**With the app:**

1. Select your database and schema from the dropdowns
2. Upload conference photos (JPG, PNG, JPEG)
3. Wait for the analysis to complete
4. Click on any row to see the image and detailed charts

**From command line:**

```bash
# Upload images
task snow:upload -- /path/to/photos/*.jpg

# List uploaded files
task snow:list

# Query results
task snow:query
```

## Available Tasks

Run `task` to see all available commands:

| Task | Description |
|------|-------------|
| `task snow:check` | Verify Snowflake CLI is installed and configured |
| `task snow:setup` | Create all Snowflake objects |
| `task snow:setup:dry-run` | Preview rendered SQL without executing |
| `task snow:upload -- FILES` | Upload images to stage |
| `task snow:list` | List files in stage |
| `task snow:query` | Query the crowd counter view |
| `task snow:refresh` | Refresh stage directory |
| `task snow:clean` | Remove files from stage |
| `task snow:teardown` | Drop all created objects (DESTRUCTIVE) |

## Configuration

All configuration is managed through environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SNOWFLAKE_DATABASE` | `CROWD_COUNTER_DB` | Target database |
| `SNOWFLAKE_SCHEMA` | `CONFERENCES` | Target schema |
| `SNOWFLAKE_STAGE` | `SNAPS` | Stage for images |
| `AI_MODEL` | `claude-4-sonnet` | Cortex AI model |

## Project Structure

```
smart-crowd-counter/
├── app.py              # Streamlit application
├── setup.sql           # Snowflake object creation
├── Taskfile.yml        # Task automation
├── environment.yml     # Conda dependencies
├── .env.example        # Environment template
├── LICENSE             # Apache 2.0
├── NOTICE              # Attribution notices
└── CITATION.cff        # Citation metadata
```

## Acknowledgments

- Snowflake for Cortex AISQL
- Streamlit for making web apps easy

## Using This Project

This project is open source under Apache 2.0. You're welcome to use, modify, and share it!

**If you use this project, please:**

1. Keep the copyright notices and NOTICE file intact
2. Credit the original author in your README or documentation:
   > Based on [Smart Crowd Counter](https://github.com/kameshsampath/smart-crowd-counter) by Kamesh Sampath
3. If presenting at events or demos, mention the original creator
4. Consider starring the repo if it helped you

**For academic or formal citations**, click the "Cite this repository" button on GitHub or see [CITATION.cff](CITATION.cff).

## License

Copyright 2026 Kamesh Sampath

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See the [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.
