# AI Session Insights 🎯

A Streamlit app that analyzes conference session photos using Snowflake Cortex AISQL to automatically count attendees and detect raised hands, providing real-time insights into audience engagement and badge distribution rates.

## ✨ Features

- **🤖 AI-Powered Analysis**: Leverages Snowflake Cortex AISQL for intelligent image processing
- **📊 Real-Time Analytics**: Instant attendee counting and engagement metrics
- **🙋‍♀️ Hand Raise Detection**: Automatically identifies potential badge recipients
- **📈 Visual Insights**: Interactive charts and conversion rate analysis
- **🖼️ Image Display**: View analyzed session photos with metadata
- **☁️ Cloud-Native**: Built on Snowflake's native Streamlit platform

## 🚀 Demo

Upload conference session photos and watch as the AI analyzes:
- Total attendee count
- Number of raised hands
- Engagement conversion rates
- Session-by-session comparisons

Perfect for live demos showcasing AI capabilities in real-world scenarios!

## 🛠️ Technology Stack

- **[Snowflake Cortex AISQL](https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql)** - AI-powered SQL for image analysis
- **[Streamlit in Snowflake](https://docs.snowflake.com/en/developer-guide/streamlit/about-streamlit)** - Native app development platform
- **[Streamlit](https://streamlit.io)** - Interactive web application framework
- **Python** - Core application logic
- **Altair** - Data visualization

## 📋 Prerequisites

- [Snowflake account](https://signup.snowflake.com/) with Cortex AISQL enabled
- Database and schema with appropriate permissions
- Snowflake stage for file storage

*Don't have Snowflake? [Sign up for a free trial](https://signup.snowflake.com/) to get started!*

## ⚙️ Setup

1. **Create Snowflake Objects**
   ```sql
   -- Create database and schema
   CREATE DATABASE IF NOT EXISTS KAMESH_DEMOS;
   CREATE SCHEMA IF NOT EXISTS KAMESH_DEMOS.CONFERENCES;
   
   -- Create stage for image uploads
   CREATE STAGE IF NOT EXISTS KAMESH_DEMOS.CONFERENCES.SNAPS
   ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
   DIRECTORY = (ENABLE = true, AUTO_REFRESH = true);
   
   -- Create Git Integration the repo or its fork
  CREATE OR REPLACE API INTEGRATION kameshsampath_github
   API_PROVIDER = git_https_api
   API_ALLOWED_PREFIXES = ('https://github.com/kameshsampath')
   ENABLED = TRUE;
   ```

2. **Create Core AI View** ⭐ 
   ```sql
   -- This is the heart of the app - AI-powered image analysis
   CREATE OR REPLACE VIEW SMART_CROWD_COUNTER AS 
   WITH image_files AS (
       SELECT 
           relative_path as name,
           TO_FILE('@kamesh_demos.conferences.snaps',relative_path) as file,
           last_modified AS last_modified
       FROM DIRECTORY('@kamesh_demos.conferences.snaps')
       WHERE relative_path LIKE '%.jpg' OR relative_path LIKE '%.jpeg'
   ),
   processed_images AS (
       SELECT 
           name,
           file,
           last_modified,
           AI_COMPLETE(
               'claude-4-sonnet',
              'Analyze image: count people and raised hands. Return JSON only: {"total_attendees": N, "raised_hands": N, "percentage_with_hands_up": N.NN}. Calculate percentage as (raised_hands/attendees)*100, round to 2 decimals.',file
           ) AS attendees_count
       FROM image_files
   )
   SELECT 
       name,
       file as file_name,
       AI_COMPLETE('claude-4-sonnet',PROMPT('# Conference Photo Caption Generator Prompt
   
   Create a concise, descriptive caption for a conference/workshop photo with the filename: `{0}`
   
   ## Context clues from filename:
   - **NS** = Northstar
   - **SWT** = Snowflake World Tour  
   - **Location abbreviations** (e.g., PUNE, DELHI, MEL for Melbourne)
   - **Numbers** likely indicate session sequence or day
   
   ## Caption requirements:
   - Keep it simple and descriptive
   - Format: *Event Name + Location + Session Type/Number*
   - Use italics for styling
   - No hashtags or additional text
   - **Add "Workshop" if you see attendees with laptops or materials in front of them (hands-on learning environment)**
   - Focus on identifying the event, location, and session clearly
   
   ## Example format:
   *[Event Name] [City] [Session Type/Number]*
   
   **Generate a clean, minimal caption that clearly identifies the event and session.**',name)) as caption,
       attendees_count as raw,
       PARSE_JSON(attendees_count):total_attendees AS total_attendees,
       PARSE_JSON(attendees_count):raised_hands AS raised_hands,  
       PARSE_JSON(attendees_count):percentage_with_hands_up AS percentage_with_hands_up
   FROM processed_images
   ORDER BY name;
   ```

3. **Deploy to Snowflake**
   - Upload the Python file to your Snowflake environment
   - Create a Streamlit app using Snowflake's native Streamlit support
   - Configure database and schema connections

4. **Configure Environment**
   - Update database and schema names in the code if different
   - Ensure proper permissions for file uploads and stage access

## 📱 Usage

1. **Select Database & Schema**: Choose your target database and schema
2. **Upload Images**: Use the file uploader to add conference session photos (JPG, PNG, JPEG)
3. **AI Analysis**: Watch as AISQL processes images and extracts insights
4. **View Results**: Browse the data table with attendee metrics
5. **Detailed Analytics**: Click any row to see the original image with analytics charts

## 🎯 Use Cases

- **Conference Analytics**: Track session attendance and engagement
- **Event Management**: Monitor audience participation in real-time
- **Badge Distribution**: Identify participants for giveaways or prizes
- **AI Demonstrations**: Showcase computer vision capabilities
- **Business Intelligence**: Generate insights from event photography

## 📊 Output Metrics

- **Total Attendees**: AI-counted number of people in the session
- **Raised Hands**: Count of participants with hands up
- **Conversion Rate**: Percentage of attendees with raised hands
- **File Metadata**: Image details, timestamps, and storage info

## 🔧 Customization

- **Database Configuration**: Update `cat_database` and `cat_schema` defaults
- **Stage Settings**: Modify stage name and encryption settings
- **UI Styling**: Customize colors, charts, and layout
- **Analysis Parameters**: Adjust AI model settings and thresholds

## 🙏 Acknowledgments

- **Snowflake** for the powerful Cortex AISQL platform
- **Streamlit** for the intuitive app development framework
- **Community** for inspiration and feedback

## 📞 Support

For questions or issues:
- Open a GitHub issue
- Check Snowflake documentation for AISQL specifics
- Review Streamlit docs for UI customization

---

**⭐ Star this repo if it helped you build something cool!**
