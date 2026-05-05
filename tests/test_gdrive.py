""" 
This test is intended to be run manually to verify the gdrive_interface pipeline is working as expected.
Run with: python -m tests.test_gdrive
"""

import os
import sys
from reportlab.pdfgen import canvas

# 1. Add the project root to sys.path to locate the 'scraper' package
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scraper.gdrive_interface import create_drive_folder, upload_and_get_pdf_link, remove_from_drive

# Creates a temporary PDF file with the given filename and content.
def create_pdf(filename, content):
    c = canvas.Canvas(filename)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 750, "GovBid Integration Test")
    
    c.setFont("Helvetica", 12)
    y = 700
    for line in content.split('\n'):
        c.drawString(100, y, line)
        y -= 20
        
    c.save()
    print(f"Created PDF: {filename}")

def run_test():
    # 2. Path Setup
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    test_pdf_path = os.path.join(project_root, "test_sample.pdf")

    # 3. Create a physical dummy PDF for the test
    pdf_body = (
        "Project: GovBid\n"
        "Status: System Integration Test\n"
        "Description: This file verifies that the GDrive API interface\n"
        "can create folders, upload files, and set public permissions."
    )

    create_pdf(test_pdf_path, pdf_body)

    print("--- Starting GDrive Upload Test ---")
    
    try:
        # 4. Execution
        folder_name = "Test Folder"
        print(f"Creating folder: '{folder_name}'...")
        fid = create_drive_folder(folder_name)
        print(f"Folder successfully created with ID: {fid}")
        
        print(f"Uploading file to folder ID: {fid}...")
        link = upload_and_get_pdf_link(test_pdf_path, folder_id=fid)
        
        # 5. Validation
        if link and "drive.google.com" in link:
            print(f"\nSUCCESS!")
            print(f"Folder ID: {fid}")
            print(f"Share Link: {link}")
        else:
            print("\nFAILED: Link not generated correctly.")

    except Exception as e:
        print(f"\nAN ERROR OCCURRED: {e}")
    
    finally:
        # 6. Cleanup local dummy file after prompting user for command line confirmation
        if os.path.exists(test_pdf_path):
            confirm = input(
                "\nDelete the local file? [y/N]: "
            ).strip().lower()

            if confirm == "y":
                try:
                    os.remove(test_pdf_path)
                    print("Cleaned up local test file.")
                except Exception as e:
                    print(f"Could not delete test file: {e}")
            else:
                print(f"Keeping local test file for manual review.")

        # 7. Cleanup Drive dummy file and folder after prompting user for command line confirmation
        if fid:
            confirm = input(
                "\nVerify the file uploaded correctly in Drive. "
                "Delete the Drive folder and file? [y/N]: "
            ).strip().lower()

            if confirm == "y":
                try:
                    remove_from_drive(fid)
                    print("Cleaned up Drive test folder and file.")
                except Exception as e:
                    print(f"Could not delete Drive folder {fid}: {e}")
            else:
                print(f"Keeping Drive test folder for manual review (ID: {fid}).")

if __name__ == "__main__":
    run_test()