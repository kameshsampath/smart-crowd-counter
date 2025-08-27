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
   
   -- Create table for attendee tracking results
   CREATE TABLE IF NOT EXISTS KAMESH_DEMOS.CONFERENCES.ATTENDEE_TRACKER (
       FILE_NAME VARIANT,
       TOTAL_ATTENDEES NUMBER,
       RAISED_HANDS NUMBER,
       PERCENTAGE_WITH_HANDS_UP FLOAT,
       RAW VARIANT
   );
   ```

2. **Deploy to Snowflake**
   - Upload the Python file to your Snowflake environment
   - Create a Streamlit app using Snowflake's native Streamlit support
   - Configure database and schema connections

3. **Configure Environment**
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
---

**⭐ Star this repo if it helped you build something cool!**
