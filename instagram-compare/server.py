from flask import Flask, render_template, request, jsonify
import os
import tempfile
import zipfile
from werkzeug.utils import secure_filename
from bs4 import BeautifulSoup
from flask_cors import CORS
import logging

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.DEBUG)

def extract_usernames(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        html_content = file.read()
    soup = BeautifulSoup(html_content, 'html.parser')
    usernames = [a.text.strip() for a in soup.find_all('a')]
    return usernames

def find_files_in_directory(folder_path):
    followers_file = None
    following_file = None

    for root, dirs, files in os.walk(folder_path):
        if os.path.basename(root) == "followers_and_following":
            for file in files:
                if file.startswith("followers") and file.endswith(".html"):
                    followers_file = os.path.join(root, file)
                elif file.startswith("following") and file.endswith(".html"):
                    following_file = os.path.join(root, file)
            break

    if not followers_file or not following_file:
        raise FileNotFoundError("Could not find `followers.html` or `following.html` in the folder.")
    
    return followers_file, following_file

def compare_followers_following(folder_path):
    followers_file, following_file = find_files_in_directory(folder_path)
    followers = set(extract_usernames(followers_file))
    following = set(extract_usernames(following_file))

    not_following_back = sorted(list(following - followers))
    not_followed_back = sorted(list(followers - following))

    return not_following_back, not_followed_back

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/about')
def instructions():
    return render_template('about.html')


@app.route('/upload-folder', methods=['POST'])
def upload_folder():
    app.logger.debug("Received upload-folder request")
    if not request.files:
        app.logger.debug("No files in request")
        return jsonify({"error": "No files uploaded"}), 400

    temp_dir = tempfile.mkdtemp()
    app.logger.debug(f"Created temporary directory: {temp_dir}")

    try:
        # Check if a zip file was uploaded
        if 'zipfile' in request.files:
            zip_file = request.files['zipfile']
            if zip_file.filename == '':
                app.logger.debug("No file selected for uploading")
                return jsonify({"error": "No file selected for uploading"}), 400

            filename = secure_filename(zip_file.filename)
            zip_path = os.path.join(temp_dir, filename)
            zip_file.save(zip_path)
            app.logger.debug(f"Saved zip file: {zip_path}")

            # Extract the zip file safely
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    # Prevent Zip Slip vulnerability
                    for member in zip_ref.namelist():
                        member_path = os.path.join(temp_dir, member)
                        if not os.path.commonprefix([temp_dir, os.path.abspath(member_path)]) == temp_dir:
                            raise Exception("Attempted Path Traversal in Zip File")
                    zip_ref.extractall(temp_dir)
                    app.logger.debug(f"Extracted zip file to: {temp_dir}")
            except zipfile.BadZipFile:
                app.logger.error("Invalid zip file")
                return jsonify({"error": "Invalid zip file"}), 400
            except Exception as e:
                app.logger.error(f"Error extracting zip file: {e}")
                return jsonify({"error": f"Error extracting zip file: {e}"}), 400

        else:
            # Handle folder upload
            folder = request.files.getlist('folder')
            if not folder:
                app.logger.debug("No 'folder' key in files")
                return jsonify({"error": "No files in folder"}), 400

            for file in folder:
                if file.filename == "":
                    app.logger.debug("File with no name uploaded")
                    return jsonify({"error": "File with no name uploaded"}), 400

                # Get the filename and path
                filename = file.filename
                dirname = os.path.dirname(filename)
                basename = os.path.basename(filename)
                secure_basename = secure_filename(basename)
                secure_filename_with_path = os.path.join(dirname, secure_basename)

                file_path = os.path.join(temp_dir, secure_filename_with_path)
                file_dir = os.path.dirname(file_path)
                if not os.path.exists(file_dir):
                    os.makedirs(file_dir)
                app.logger.debug(f"Saving file: {file_path}")
                file.save(file_path)

        # Perform comparison
        not_following_back, not_followed_back = compare_followers_following(temp_dir)
        app.logger.debug("Comparison successful")

        return jsonify({
            "status": "Comparison Successful!",
            "not_following_back": not_following_back,
            "not_followed_back": not_followed_back,
        })

    except Exception as e:
        app.logger.error(f"Error during processing: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        # Cleanup: Remove temporary directory
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)
            app.logger.debug(f"Cleaned up temporary directory: {temp_dir}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
