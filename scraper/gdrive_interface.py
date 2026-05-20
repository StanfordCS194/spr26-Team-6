"""
This file provides a interface for interacting with Google Drive using the Google API.
It is used to create folders, upload files, and get file links.

Local staging:
- ``upload_files_from_local_folder`` uploads every file in a directory matching an
  optional extension allowlist (default: every regular file).
- ``upload_pdfs_from_local_folder`` is a thin PDF-only wrapper kept for the
  Cal eProcure pipeline.
- ``delete_local_files_in_folder`` removes local files only (never Drive).

See tests/test_gdrive.py for unit test.

Requires: ``pip install google-api-python-client google-auth-oauthlib google-auth-httplib2``
(or ``pip install -r requirements.txt`` from the repo root).
"""

import mimetypes
import os


def _import_drive_libs():
    """
    Lazily import the Google API client libraries.

    Loaded on first Drive call so that pure local helpers
    (e.g. :func:`delete_local_files_in_folder`) can run without the
    ``google-api-python-client`` stack installed.
    """
    from google.oauth2.credentials import Credentials  # type: ignore
    from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore
    from google.auth.transport.requests import Request  # type: ignore
    from googleapiclient.discovery import build  # type: ignore
    from googleapiclient.http import MediaFileUpload  # type: ignore

    return Credentials, InstalledAppFlow, Request, build, MediaFileUpload

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
    Credentials, InstalledAppFlow, Request, build, _MediaFileUpload = _import_drive_libs()
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


def _normalize_extensions(extensions):
    """Return a set of lower-case extensions like ``{".pdf", ".docx"}`` or ``None`` for any."""
    if extensions is None:
        return None
    norm = set()
    for ext in extensions:
        if not ext:
            continue
        e = ext.lower().strip()
        if not e.startswith("."):
            e = "." + e
        norm.add(e)
    return norm or None


def _sorted_file_paths_in_local_folder(local_folder_path, extensions=None):
    """
    Non-recursive list of absolute paths to regular files in a directory, sorted by basename.

    ``extensions`` is an optional iterable like ``("pdf", ".docx")``. Pass ``None`` (default)
    to include every regular file regardless of extension.
    """
    if not os.path.isdir(local_folder_path):
        raise NotADirectoryError(f"Not a directory: {local_folder_path}")
    allowed = _normalize_extensions(extensions)
    names = sorted(os.listdir(local_folder_path))
    paths = []
    for n in names:
        p = os.path.join(os.path.abspath(local_folder_path), n)
        if not os.path.isfile(p):
            continue
        if allowed is not None and os.path.splitext(n)[1].lower() not in allowed:
            continue
        paths.append(p)
    return paths


def _sorted_pdf_paths_in_local_folder(local_folder_path):
    """
    Non-recursive list of absolute paths to ``.pdf`` files in a directory, sorted by basename.
    Thin wrapper kept for the Cal eProcure pipeline; new code should prefer
    :func:`_sorted_file_paths_in_local_folder`.
    """
    return _sorted_file_paths_in_local_folder(local_folder_path, extensions=(".pdf",))


def upload_files_to_folder(
    file_paths,
    folder_id,
    credentials_path=None,
    token_path=None,
    extensions=None,
):
    """
    Upload each existing path in ``file_paths`` into Drive folder ``folder_id``.

    Mime type is inferred via :mod:`mimetypes`. If ``extensions`` is provided
    (e.g. ``("pdf", "docx", "xlsx")``), files whose extension does not match
    are skipped.

    Returns a list of ``(file_basename, webViewLink)`` in upload order.
    """
    allowed = _normalize_extensions(extensions)
    results = []
    for fp in file_paths:
        if not fp or not os.path.isfile(fp):
            continue
        if allowed is not None and os.path.splitext(str(fp))[1].lower() not in allowed:
            continue
        link = upload_and_get_file_link(
            fp,
            folder_id=folder_id,
            credentials_path=credentials_path,
            token_path=token_path,
        )
        results.append((os.path.basename(fp), link))
    return results


def upload_files_from_local_folder(
    local_folder_path,
    drive_folder_id,
    credentials_path=None,
    token_path=None,
    extensions=None,
):
    """
    Upload every regular file in ``local_folder_path`` (non-recursive) into the Drive
    folder ``drive_folder_id``, in sorted basename order.

    ``extensions`` filters to specific suffixes. Default ``None`` uploads every file.

    Returns a list of ``(file_basename, webViewLink)``.
    """
    paths = _sorted_file_paths_in_local_folder(local_folder_path, extensions=extensions)
    return upload_files_to_folder(
        paths,
        drive_folder_id,
        credentials_path=credentials_path,
        token_path=token_path,
        extensions=extensions,
    )


def upload_pdfs_to_folder(
    file_paths,
    folder_id,
    credentials_path=None,
    token_path=None,
):
    """
    PDF-only convenience wrapper around :func:`upload_files_to_folder`.

    Returns a list of ``(file_basename, webViewLink)`` for ``.pdf`` uploads only.
    """
    return upload_files_to_folder(
        file_paths,
        folder_id,
        credentials_path=credentials_path,
        token_path=token_path,
        extensions=(".pdf",),
    )


def upload_pdfs_from_local_folder(
    local_folder_path,
    drive_folder_id,
    credentials_path=None,
    token_path=None,
):
    """
    PDF-only convenience wrapper around :func:`upload_files_from_local_folder`.
    """
    return upload_files_from_local_folder(
        local_folder_path,
        drive_folder_id,
        credentials_path=credentials_path,
        token_path=token_path,
        extensions=(".pdf",),
    )


def delete_local_files_in_folder(folder_path, extensions=(".pdf",)):
    """
    Delete local files under ``folder_path`` (non-recursive; subdirectories are ignored).
    Does **not** delete anything on Google Drive.

    Only files whose names end with one of ``extensions`` (case-insensitive) are removed.
    Default is PDFs only. Pass ``extensions=None`` to remove all regular files in the folder.

    Returns a list of basenames that were deleted.
    """
    if not os.path.isdir(folder_path):
        raise NotADirectoryError(f"Not a directory: {folder_path}")
    root = os.path.abspath(folder_path)
    removed = []
    for name in os.listdir(root):
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        if extensions is not None:
            low = name.lower()
            if not any(
                low.endswith(ext.lower() if ext.startswith(".") else f".{ext.lower()}")
                for ext in extensions
            ):
                continue
        os.remove(path)
        removed.append(name)
    return removed


# Uploads a PDF file to GDrive and shares it with anyone with the link.
def upload_and_get_file_link(
    file_path,
    folder_id=None,
    credentials_path=None,
    token_path=None,
    mime_type=None,
):
    """
    Upload any single file to Drive and return the public ``webViewLink``.

    The mime type is inferred from the path via :func:`mimetypes.guess_type` when
    ``mime_type`` is not provided; falls back to ``application/octet-stream``.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    if not os.path.isfile(file_path):
        raise ValueError(f"Not a regular file: {file_path}")

    _C, _I, _R, _B, MediaFileUpload = _import_drive_libs()
    service = get_drive_service(credentials_path=credentials_path, token_path=token_path)

    file_metadata = {'name': os.path.basename(file_path)}
    if folder_id:
        file_metadata['parents'] = [folder_id]

    if not mime_type:
        guessed, _ = mimetypes.guess_type(file_path)
        mime_type = guessed or 'application/octet-stream'
    media = MediaFileUpload(file_path, mimetype=mime_type)

    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, webViewLink'
    ).execute()

    file_id = file.get('id')
    print(f"File uploaded. ID: {file_id} ({mime_type})")

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


def upload_and_get_pdf_link(file_path, folder_id=None, credentials_path=None, token_path=None):
    """
    PDF-only convenience wrapper around :func:`upload_and_get_file_link`.
    Raises :class:`ValueError` if ``file_path`` is not ``.pdf``.
    """
    if not file_path.lower().endswith(".pdf"):
        raise ValueError(f"Expected a PDF file, got: {file_path}")
    return upload_and_get_file_link(
        file_path,
        folder_id=folder_id,
        credentials_path=credentials_path,
        token_path=token_path,
        mime_type='application/pdf',
    )

# Remove a Drive folder or file based on its ID
def remove_from_drive(id, credentials_path=None, token_path=None):
    service = get_drive_service(credentials_path=credentials_path, token_path=token_path)
    
    # If the target ID is a folder, all contents are recursively deleted
    service.files().delete(fileId=id).execute()
    print(f"Drive object removed: {id}")