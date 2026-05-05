"""
This module provides a interface for interacting with Google Drive using the Google API.
It is used to create folders, upload files, and get file links.
"""

import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# Limit the scope of GDrive access.
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Locates credentials.json and token.json.
# Automatically uses GOOGLE_DRIVE_CREDENTIALS_PATH and GOOGLE_DRIVE_TOKEN_PATH if set.
# Otherwise, finds the files in the current module.
def _default_credentials_paths():
    credentials_path = os.getenv("GOOGLE_DRIVE_CREDENTIALS_PATH")
    token_path = os.getenv("GOOGLE_DRIVE_TOKEN_PATH")
    if credentials_path and token_path:
        return credentials_path, token_path

    scraper_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(scraper_dir)
    return (
        credentials_path or os.path.join(project_dir, "credentials.json"),
        token_path or os.path.join(project_dir, "token.json"),
    )

# Initializes the GDrive service.
# Automatically uses credentials.json and token.json if not provided.
# Otherwise, uses the files in the current module.
def get_drive_service(credentials_path=None, token_path=None):
    credentials_path = credentials_path or _default_credentials_paths()[0]
    token_path = token_path or _default_credentials_paths()[1]
    creds = None

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(credentials_path):
                raise FileNotFoundError(
                    f"Google Drive credentials file not found: {credentials_path}"
                )
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)

        # Save the credentials for the next run
        with open(token_path, 'w') as token:
            token.write(creds.to_json())

    return build('drive', 'v3', credentials=creds)

# Creates a new, named folder in GDrive & returns the folder ID.
def create_drive_folder(folder_name, credentials_path=None, token_path=None):
    service = get_drive_service(credentials_path=credentials_path, token_path=token_path)
    
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    
    folder = service.files().create(
        body=file_metadata,
        fields='id'
    ).execute()
    
    return folder.get('id')

# Uploads a PDF file to GDrive and shares it with anyone with the link.
def upload_and_get_pdf_link(file_path, folder_id=None, credentials_path=None, token_path=None):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")
    if not file_path.lower().endswith(".pdf"):
        raise ValueError(f"Expected a PDF file, got: {file_path}")

    service = get_drive_service(credentials_path=credentials_path, token_path=token_path)

    # 1. Upload the file and set parent folder if provided
    file_metadata = {'name': os.path.basename(file_path)}
    if folder_id:
        file_metadata['parents'] = [folder_id]

    media = MediaFileUpload(file_path, mimetype='application/pdf')
    
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, webViewLink'
    ).execute()

    file_id = file.get('id')
    print(f"File uploaded. ID: {file_id}")

    # 2. Change permissions to 'anyone with the link can view'
    permission = {
        'type': 'anyone',
        'role': 'reader',
    }
    service.permissions().create(
        fileId=file_id,
        body=permission
    ).execute()

    # 3. Get the sharing link
    return file.get('webViewLink')

# Remove a Drive folder or file based on its ID
def remove_from_drive(id, credentials_path=None, token_path=None):
    service = get_drive_service(credentials_path=credentials_path, token_path=token_path)
    
    # If the target ID is a folder, all contents are recursively deleted
    service.files().delete(fileId=id).execute()
    print(f"Drive object removed: {id}")