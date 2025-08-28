# Import python packages
import streamlit as st
import io
import pandas as pd
import altair as alt
from snowflake.core import Root, CreateMode
from snowflake.core.schema import Schema
from snowflake.core.stage import Stage, StageEncryption, StageDirectoryTable
from snowflake.snowpark.context import get_active_session
import time
import json

st.title("Smart Crowd Counter 👥")
st.write(
    """This Streamlit app helps track conference attendees and badge distribution using AI-powered image analysis.
  
  **How it works:**
  - Upload images (JPG, PNG, JPEG) from your conference sessions
  - AI analyzes the images to count total attendees and identify raised hands (potential badges)
  - View conversion rates and visualize badge distribution
  - Select any row from the table below to see detailed analytics
  
  **Get started:** Use the file uploader below to upload your session photos.
  """
)

# session state variables
if "selected_row" not in st.session_state:
    st.session_state.selected_row = []

if "cat_database" not in st.session_state:
     st.session_state.cat_database = "KAMESH_DEMOS"

if "cat_schema" not in st.session_state:
     st.session_state.cat_schema = "CONFERENCES"

if "files_uploaded" not in st.session_state:
    st.session_state.files_uploaded = False

# Get the current credentials
session = get_active_session()
root = Root(session)

db_idx = 0
schema_idx = 0
__stage_name = "snaps"
__stage_schema = None

__model_name = 'claude-4-sonnet'

# Function to refresh data from table
def refresh_data():
    __sql = "select * from kamesh_demos.conferences.smart_crowd_counter"
    return session.sql(__sql).to_pandas()

def get_image_url_from_stage(file_json_str):
    """Get presigned URL for image from Snowflake stage using the file JSON"""
    try:
        if file_json_str is None:
            return None
            
        # Parse the JSON string to get file info
        if isinstance(file_json_str, str):
            file_obj = json.loads(file_json_str)
        else:
            file_obj = file_json_str
        
        # Extract stage and relative path
        stage = file_obj.get("STAGE")
        relative_path = file_obj.get("RELATIVE_PATH")
        
        if not stage or not relative_path:
            st.warning("Missing STAGE or RELATIVE_PATH in file metadata")
            return None
        
        # Get presigned URL (valid for 7 days = 604800 seconds)
        url_sql = f"SELECT GET_PRESIGNED_URL('{stage}', '{relative_path}', 604800) as url"
        result = session.sql(url_sql).collect()
        
        if result and len(result) > 0:
            return result[0][0]
        else:
            return None
            
    except Exception as e:
        st.error(f"Error getting presigned URL: {str(e)}")
        return None

def extract_filename_from_json(file_name_json):
    """Extract RELATIVE_PATH from the FILE_NAME JSON column"""
    try:
        if isinstance(file_name_json, str):
            # Parse the JSON string
            file_info = json.loads(file_name_json)
            return file_info.get('RELATIVE_PATH', None)
        elif isinstance(file_name_json, dict):
            # Already a dictionary
            return file_name_json.get('RELATIVE_PATH', None)
        else:
            return None
    except (json.JSONDecodeError, AttributeError, TypeError) as e:
        st.warning(f"Could not parse filename JSON: {str(e)}")
        return None

def create_ratio_chart(row: pd.Series):
    total_attendees = int(row["TOTAL_ATTENDEES"])
    possible_badges = float(row["RAISED_HANDS"])
    
    if row["PERCENTAGE_WITH_HANDS_UP"] is not None:
     conversion_percentage = float(row["PERCENTAGE_WITH_HANDS_UP"])
    
    badges_per_attendee = possible_badges / total_attendees
    
    ratio_data = pd.DataFrame({
        'Category': ['Total Attendees', 'Raised Hands'], 
        'Count': [total_attendees, possible_badges]
    })
    
    chart = alt.Chart(ratio_data.dropna()).mark_arc(innerRadius=50).encode(
        theta=alt.Theta('Count:Q'),
        color=alt.Color('Category:N', 
                       scale=alt.Scale(range=['#2ca02c', '#ff7f0e'])),
        tooltip=['Category:N', 'Count:Q']
    ).properties(
        width=300,
        height=300,
    )
    
    return chart

# Initialize or refresh dataframe
if "df" not in st.session_state:
    st.session_state.df = refresh_data()

# Only refresh data if files were uploaded and we haven't refreshed yet
if st.session_state.get("files_uploaded", False):
    st.session_state.df = refresh_data()
    st.session_state.files_uploaded = False  # Reset flag to prevent continuous refresh
    
databases = [db.name for db in root.databases.iter(like='%_%')]

if st.session_state.cat_database:
    db_idx = databases.index(st.session_state.cat_database)

__database = st.selectbox("Select Database:",databases,index=db_idx)

if __database:
   st.session_state.cat_database=__database
   db_schemas = [""] + [schema.name for schema in root.databases[__database].schemas.iter() if schema.name.upper() != 'INFORMATION_SCHEMA']
   
   if st.session_state.cat_schema:
    schema_idx = db_schemas.index(st.session_state.cat_schema)
   
   __stage_schema = st.selectbox("Select Schemas:",db_schemas,index=schema_idx,)
   st.session_state.cat_schema=__stage_schema

   if not __stage_schema:
        __stage_schema = st.text_input("New Schema Name", value="")
        if not __stage_schema:
            st.error("Schema name is required. Choose select one or enter name of the new schema")
        if __stage_schema:
            __schema = Schema(__stage_schema)
            root.databases[__database].schemas.create(__schema,mode=CreateMode.if_not_exists,)
        st.session_state.cat_schema=__stage_schema

   if __stage_schema:
        snap_stage = Stage(
          name=__stage_name,
          encryption=StageEncryption(type="SNOWFLAKE_SSE"),
          directory_table=StageDirectoryTable(enable=True,auto_refresh=True)
        )
        stages = root.databases[__database].schemas[__stage_schema].stages
        stages.create(snap_stage, mode=CreateMode.if_not_exists,)

if st.session_state.cat_schema:
    _files = st.file_uploader(label="Upload a photo from conference session",accept_multiple_files=True,)

    if "stage_name_fqn" not in st.session_state:
         st.session_state.stage_name_fqn=f'@{__database}.{__stage_schema}.{__stage_name}'
    
    # Track uploaded file names to prevent re-processing
    if "uploaded_files" not in st.session_state:
        st.session_state.uploaded_files = set()
    
    if _files is not None and len(_files) > 0:
        # Check if these are new files
        current_file_names = {f.name for f in _files}
        new_files = [f for f in _files if f.name not in st.session_state.uploaded_files]
        
        if new_files:  # Only process new files
            upload_success = True
            upload_errors = []
            
            with st.spinner("Uploading files and refreshing data..."):
                for _file in new_files:
                   _file_bytes = io.BytesIO(_file.getvalue())
                   __stage_file = f"{st.session_state.stage_name_fqn}/{_file.name}"
                   
                   try:
                       # Upload file
                       session.file.put_stream(_file_bytes,
                                                 __stage_file,
                                                 auto_compress=False,
                                                 overwrite=True,)
                       st.success(f"Uploaded: {_file.name}")
                       st.session_state.uploaded_files.add(_file.name)
                       
                   except Exception as e:
                       upload_errors.append(f"Error uploading {_file.name}: {str(e)}")
                       upload_success = False
                
                # Refresh stage after all uploads
                if upload_success and new_files:
                    try:
                        refresh_result = session.sql(f"ALTER STAGE {st.session_state.stage_name_fqn[1:]} REFRESH").collect()
                        st.success("Stage refreshed successfully!")
                        
                        # Add a small delay to ensure processing is complete
                        time.sleep(2)
                        
                        # Refresh data without rerun
                        st.session_state.df = refresh_data()
                        st.session_state.files_uploaded = True
                        
                    except Exception as e:
                        st.error(f"Error refreshing stage: {str(e)}")
                        upload_success = False
            
            # Display any upload errors
            if upload_errors:
                for error in upload_errors:
                    st.error(error)
    
    # Manual refresh button
    if st.button("Refresh Data"):
        with st.spinner("Refreshing data..."):
            try:
                # Refresh stage
                session.sql(f"ALTER STAGE {st.session_state.stage_name_fqn[1:]} REFRESH").collect()
                
                # Wait a moment for processing
                time.sleep(2)
                
                # Refresh dataframe
                st.session_state.df = refresh_data()
                st.session_state.files_uploaded = True
                st.success("Data refreshed successfully!")
                
            except Exception as e:
                st.error(f"Error refreshing data: {str(e)}")
    
    # # Update table data
    # if "table_data" not in st.session_state or st.session_state.files_uploaded:
    #     st.session_state.table_data = st.session_state.df.copy().drop('RAW', axis=1) if 'RAW' in st.session_state.df.columns else st.session_state.df.copy()
    
    # Display dataframe
    if not st.session_state.df.empty:
        event = st.dataframe(st.session_state.df,
                             on_select="rerun",
                             selection_mode="single-row",
                             hide_index=True,
                             column_config={ 
                                "CAPTION": None,   # Hide this column
                                "FILE_NAME": None, # Hide this column
                                "RAW": None,       # Hide this column too
                            },)
        
        if event.selection:
            st.session_state.selected_row = event.selection.rows
    else:
        st.info("No data available. Upload some files to get started!")
    
    # Display selected row details with image and analytics
    if st.session_state.selected_row and not st.session_state.df.empty:
        __idx = st.session_state.selected_row[0]
        if __idx < len(st.session_state.df):
            selected_row = st.session_state.df.iloc[__idx]
            
            # Create two columns for image and chart
            col1, col2 = st.columns([1, 1])
            
            with col1:
                st.subheader("📸 Session Image")
                
                # Get the presigned URL for the image
                image_url = None
                filename = None
                
                if 'FILE_NAME' in selected_row.index and selected_row['FILE_NAME']:
                    file_name_json = selected_row['FILE_NAME']
                    filename = extract_filename_from_json(file_name_json)
                    
                    with st.spinner("Getting image URL..."):
                        image_url = get_image_url_from_stage(file_name_json)

                caption = selected_row['CAPTION']
                if image_url and filename:
                    # Display the image using the presigned URL
                    st.image(image_url, caption=f"Session: {caption}", use_container_width=True)
                    
                    # Display image metadata from JSON
                    try:
                        file_info = json.loads(selected_row['FILE_NAME']) if isinstance(selected_row['FILE_NAME'], str) else selected_row['FILE_NAME']
                        
                        # Create expandable section with file metadata
                        with st.expander("📋 File Details"):
                            col_a, col_b = st.columns(2)
                            with col_a:
                                st.write(f"**Content Type:** {file_info.get('CONTENT_TYPE', 'N/A')}")
                                st.write(f"**File Size:** {file_info.get('SIZE', 'N/A'):,} bytes")
                            with col_b:
                                st.write(f"**Last Modified:** {file_info.get('LAST_MODIFIED', 'N/A')}")
                                st.write(f"**ETag:** {file_info.get('ETAG', 'N/A')[:16]}...")
                    except Exception as e:
                        st.warning(f"Could not parse file metadata: {str(e)}")
                    
                    # Display session analytics metadata
                    st.caption(f"**Attendees:** {selected_row['TOTAL_ATTENDEES']} | "
                             f"**Raised Hands:** {selected_row['RAISED_HANDS']} | "
                             f"**Conversion:** {selected_row.get('PERCENTAGE_WITH_HANDS_UP', 'N/A')}%")
                    
                elif filename:
                    st.error(f"Could not generate presigned URL for: {filename}")
                    st.info("Check Snowflake permissions for GET_PRESIGNED_URL function")
                else:
                    st.info("No valid image file found in selected row")
                    # Debug info
                    with st.expander("🔍 Debug Info"):
                        st.write("Available columns:", list(selected_row.index))
                        if 'FILE_NAME' in selected_row.index:
                            st.write("FILE_NAME content:", selected_row['FILE_NAME'])
                            try:
                                parsed = json.loads(selected_row['FILE_NAME']) if isinstance(selected_row['FILE_NAME'], str) else selected_row['FILE_NAME']
                                st.json(parsed)
                            except Exception as e:
                                st.write(f"Could not parse FILE_NAME as JSON: {str(e)}")
            
            with col2:
                st.subheader("📊 Analytics")
                chart = create_ratio_chart(selected_row)
                st.altair_chart(chart, use_container_width=True)
                
                # Additional metrics
                st.metric(
                    label="Conversion Rate", 
                    value=f'{float(selected_row.get("PERCENTAGE_WITH_HANDS_UP", 0)):.1f}%',
                    delta=None
                )
                st.metric(
                    label="Total Attendees", 
                    value=int(selected_row['TOTAL_ATTENDEES']),
                    delta=None
                )
                st.metric(
                    label="Raised Hands", 
                    value=int(selected_row['RAISED_HANDS']),
                    delta=None
                )
    
st.markdown(f"_Built using [Streamlit](https://streamlit.io) v{st.__version__}_")
