"""
PlatformIO Builder Service - Flask Application
Provides REST API for building ESP32 firmware with real-time SSE streaming
"""
import os
import json
import time
import uuid
import logging
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Generator

from flask import Flask, request, Response, send_file, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import Config
from builder import PlatformIOBuilder

# Configure logging
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Store active builds
active_builds = {}

# Ensure required directories exist
Config.ensure_directories()


def format_sse(event: str, data: dict) -> str:
    """
    Format Server-Sent Event

    Args:
        event: Event type
        data: Event data dictionary

    Returns:
        Formatted SSE string
    """
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def cleanup_old_builds():
    """Clean up old build directories"""
    try:
        cutoff_time = datetime.now() - timedelta(seconds=Config.BUILD_CLEANUP_AGE)

        for build_dir in Config.BUILDS_DIR.iterdir():
            if not build_dir.is_dir():
                continue

            # Check if directory is old enough to clean
            mod_time = datetime.fromtimestamp(build_dir.stat().st_mtime)
            if mod_time < cutoff_time:
                logger.info(f"Cleaning up old build: {build_dir.name}")
                shutil.rmtree(build_dir, ignore_errors=True)

                # Remove from active builds
                if build_dir.name in active_builds:
                    del active_builds[build_dir.name]
    except Exception as e:
        logger.error(f"Error cleaning up builds: {e}")


def validate_file(filename: str) -> bool:
    """
    Validate uploaded file

    Args:
        filename: Name of file

    Returns:
        True if valid, False otherwise
    """
    if not filename:
        return False

    # Check extension
    ext = Path(filename).suffix.lower()
    return ext in Config.ALLOWED_EXTENSIONS


def save_uploaded_files(files, build_dir: Path) -> tuple[bool, str]:
    """
    Save uploaded files to build directory

    Args:
        files: List of uploaded files
        build_dir: Target directory

    Returns:
        (success, error_message)
    """
    try:
        has_platformio_ini = False
        has_source_file = False

        for file in files:
            if not file.filename:
                continue

            # Validate file
            if not validate_file(file.filename):
                return False, f"Invalid file type: {file.filename}"

            # Secure filename
            filename = secure_filename(file.filename)

            # Check for required files
            if filename == 'platformio.ini':
                has_platformio_ini = True
            if filename.endswith(('.cpp', '.ino', '.c')):
                has_source_file = True

            # Determine file path based on file type
            # PlatformIO expects source files in src/ directory
            if filename == 'platformio.ini':
                # platformio.ini goes to root
                file_path = build_dir / filename
            else:
                # All other files (source, headers) go to src/
                src_dir = build_dir / 'src'
                src_dir.mkdir(parents=True, exist_ok=True)
                file_path = src_dir / filename

            # Save file
            file.save(str(file_path))
            logger.info(f"Saved file: {file_path}")

        # Validate required files
        if not has_platformio_ini:
            return False, "Missing platformio.ini file"

        if not has_source_file:
            return False, "No source files (.cpp, .ino, .c) found"

        return True, ""

    except Exception as e:
        logger.error(f"Error saving files: {e}", exc_info=True)
        return False, str(e)


def stream_build_events(build_id: str, build_dir: Path) -> Generator[str, None, None]:
    """
    Stream build events as SSE

    Args:
        build_id: Build identifier
        build_dir: Build directory path

    Yields:
        SSE formatted strings
    """
    try:
        # Send initial comment to establish connection
        yield ": connected\n\n"

        # Create builder instance
        builder = PlatformIOBuilder(build_dir, timeout=Config.MAX_BUILD_TIME)
        active_builds[build_id] = builder

        # Stream events from builder
        for event_data in builder.build():
            event_type = event_data['event']
            data = event_data['data']

            # Add build_id to all events
            data['build_id'] = build_id

            yield format_sse(event_type, data)

        # Remove from active builds
        if build_id in active_builds:
            del active_builds[build_id]

    except Exception as e:
        logger.error(f"Error streaming build: {e}", exc_info=True)
        yield format_sse('error', {
            'build_id': build_id,
            'code': 'STREAM_ERROR',
            'message': str(e),
            'timestamp': time.time()
        })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'platformio-builder',
        'timestamp': time.time(),
        'active_builds': len(active_builds)
    })


@app.route('/build', methods=['POST'])
def build_firmware():
    """
    Build firmware from uploaded files

    Accepts multipart/form-data with files
    Returns SSE stream of build events
    """
    try:
        # Check for files
        if 'files' not in request.files:
            return jsonify({
                'error': 'No files provided',
                'code': 'NO_FILES'
            }), 400

        files = request.files.getlist('files')
        if not files or len(files) == 0:
            return jsonify({
                'error': 'No files provided',
                'code': 'NO_FILES'
            }), 400

        # Generate build ID
        build_id = str(uuid.uuid4())
        build_dir = Config.BUILDS_DIR / build_id
        build_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Starting build {build_id} with {len(files)} files")

        # Save uploaded files
        success, error_msg = save_uploaded_files(files, build_dir)
        if not success:
            # Clean up
            shutil.rmtree(build_dir, ignore_errors=True)
            return jsonify({
                'error': error_msg,
                'code': 'FILE_ERROR'
            }), 400

        # Clean up old builds before starting new one
        cleanup_old_builds()

        # Return SSE stream
        return Response(
            stream_build_events(build_id, build_dir),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID'
            }
        )

    except Exception as e:
        logger.error(f"Error in build endpoint: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'INTERNAL_ERROR'
        }), 500


@app.route('/build/init', methods=['POST'])
def init_build():
    """
    Initialize a build - upload files and get build_id
    Does NOT start building, just prepares the build directory

    Returns:
        JSON with build_id
    """
    try:
        # Check for files
        if 'files' not in request.files:
            return jsonify({
                'error': 'No files provided',
                'code': 'NO_FILES'
            }), 400

        files = request.files.getlist('files')
        if not files or len(files) == 0:
            return jsonify({
                'error': 'No files provided',
                'code': 'NO_FILES'
            }), 400

        # Generate build ID
        build_id = str(uuid.uuid4())
        build_dir = Config.BUILDS_DIR / build_id
        build_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Initializing build {build_id} with {len(files)} files")

        # Save uploaded files
        success, error_msg = save_uploaded_files(files, build_dir)
        if not success:
            # Clean up
            shutil.rmtree(build_dir, ignore_errors=True)
            return jsonify({
                'error': error_msg,
                'code': 'FILE_ERROR'
            }), 400

        # Return build ID
        return jsonify({
            'build_id': build_id,
            'status': 'initialized',
            'file_count': len(files)
        })

    except Exception as e:
        logger.error(f"Error in init endpoint: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'INTERNAL_ERROR'
        }), 500


@app.route('/build/<build_id>/stream', methods=['GET'])
def stream_build(build_id: str):
    """
    Stream build events for an initialized build

    Args:
        build_id: Build identifier from /build/init

    Returns:
        SSE stream of build events
    """
    try:
        # Validate build_id format
        try:
            uuid.UUID(build_id)
        except ValueError:
            return jsonify({
                'error': 'Invalid build ID format',
                'code': 'INVALID_BUILD_ID'
            }), 400

        build_dir = Config.BUILDS_DIR / build_id

        if not build_dir.exists():
            return jsonify({
                'error': 'Build not found',
                'code': 'NOT_FOUND'
            }), 404

        logger.info(f"Starting SSE stream for build {build_id}")

        # Clean up old builds before starting new one
        cleanup_old_builds()

        # Return SSE stream
        return Response(
            stream_build_events(build_id, build_dir),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID'
            }
        )

    except Exception as e:
        logger.error(f"Error in stream endpoint: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'INTERNAL_ERROR'
        }), 500


@app.route('/download/<build_id>', methods=['GET'])
def download_firmware(build_id: str):
    """
    Download compiled firmware binary

    Args:
        build_id: Build identifier

    Returns:
        Binary file or error
    """
    try:
        # Validate build_id format
        try:
            uuid.UUID(build_id)
        except ValueError:
            return jsonify({
                'error': 'Invalid build ID format',
                'code': 'INVALID_BUILD_ID'
            }), 400

        # Find firmware file
        firmware_path = Config.BUILDS_DIR / build_id / 'firmware.bin'

        if not firmware_path.exists():
            return jsonify({
                'error': 'Firmware not found',
                'code': 'NOT_FOUND'
            }), 404

        logger.info(f"Downloading firmware: {build_id}")

        # Send file
        return send_file(
            firmware_path,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=f'firmware-{build_id}.bin'
        )

    except Exception as e:
        logger.error(f"Error downloading firmware: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'DOWNLOAD_ERROR'
        }), 500


@app.route('/cancel/<build_id>', methods=['DELETE'])
def cancel_build(build_id: str):
    """
    Cancel running build

    Args:
        build_id: Build identifier

    Returns:
        Success message or error
    """
    try:
        # Validate build_id format
        try:
            uuid.UUID(build_id)
        except ValueError:
            return jsonify({
                'error': 'Invalid build ID format',
                'code': 'INVALID_BUILD_ID'
            }), 400

        # Check if build is active
        if build_id not in active_builds:
            return jsonify({
                'error': 'Build not found or already completed',
                'code': 'NOT_FOUND'
            }), 404

        # Cancel build
        builder = active_builds[build_id]
        builder.cancel()

        logger.info(f"Cancelled build: {build_id}")

        return jsonify({
            'success': True,
            'message': 'Build cancelled',
            'build_id': build_id
        })

    except Exception as e:
        logger.error(f"Error cancelling build: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'CANCEL_ERROR'
        }), 500


@app.route('/build/<build_id>', methods=['DELETE'])
def delete_build(build_id: str):
    """
    Delete a build directory and all its files

    Args:
        build_id: Build identifier

    Returns:
        Success message or error
    """
    try:
        # Validate build_id format
        try:
            uuid.UUID(build_id)
        except ValueError:
            return jsonify({
                'error': 'Invalid build ID format',
                'code': 'INVALID_BUILD_ID'
            }), 400

        build_dir = Config.BUILDS_DIR / build_id

        if not build_dir.exists():
            return jsonify({
                'error': 'Build directory not found',
                'code': 'NOT_FOUND'
            }), 404

        # Cannot delete active builds
        if build_id in active_builds:
            return jsonify({
                'error': 'Cannot delete active build',
                'code': 'BUILD_ACTIVE'
            }), 400

        # Delete build directory
        shutil.rmtree(build_dir, ignore_errors=True)
        logger.info(f"Deleted build directory: {build_id}")

        return jsonify({
            'success': True,
            'message': 'Build directory deleted',
            'build_id': build_id
        })

    except Exception as e:
        logger.error(f"Error deleting build: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'DELETE_ERROR'
        }), 500


@app.route('/build/<build_id>/files', methods=['GET'])
def get_build_files(build_id: str):
    """
    Get source files for a build

    Args:
        build_id: Build identifier

    Returns:
        List of files with their content
    """
    try:
        # Validate build_id format
        try:
            uuid.UUID(build_id)
        except ValueError:
            return jsonify({
                'error': 'Invalid build ID format',
                'code': 'INVALID_BUILD_ID'
            }), 400

        build_dir = Config.BUILDS_DIR / build_id

        if not build_dir.exists():
            return jsonify({
                'error': 'Build directory not found',
                'code': 'NOT_FOUND'
            }), 404

        files = []

        # Get platformio.ini
        platformio_ini = build_dir / 'platformio.ini'
        if platformio_ini.exists():
            files.append({
                'name': 'platformio.ini',
                'content': platformio_ini.read_text(encoding='utf-8'),
                'path': 'platformio.ini'
            })

        # Get all source files from src/ directory
        src_dir = build_dir / 'src'
        if src_dir.exists():
            for file_path in src_dir.rglob('*'):
                if file_path.is_file():
                    try:
                        relative_path = file_path.relative_to(build_dir)
                        files.append({
                            'name': file_path.name,
                            'content': file_path.read_text(encoding='utf-8'),
                            'path': str(relative_path)
                        })
                    except Exception as e:
                        logger.warning(f"Could not read file {file_path}: {e}")

        return jsonify({
            'success': True,
            'build_id': build_id,
            'files': files,
            'count': len(files)
        })

    except Exception as e:
        logger.error(f"Error getting build files: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'ERROR'
        }), 500


@app.route('/builds', methods=['GET'])
def list_builds():
    """
    List all builds

    Returns:
        List of builds with metadata
    """
    try:
        builds = []

        for build_dir in Config.BUILDS_DIR.iterdir():
            if not build_dir.is_dir():
                continue

            firmware_path = build_dir / 'firmware.bin'

            build_info = {
                'build_id': build_dir.name,
                'created_at': build_dir.stat().st_ctime,
                'modified_at': build_dir.stat().st_mtime,
                'status': 'active' if build_dir.name in active_builds else 'completed',
                'has_firmware': firmware_path.exists()
            }

            if firmware_path.exists():
                build_info['firmware_size'] = firmware_path.stat().st_size

            builds.append(build_info)

        # Sort by creation time (newest first)
        builds.sort(key=lambda x: x['created_at'], reverse=True)

        return jsonify({
            'builds': builds,
            'total': len(builds),
            'active': len(active_builds)
        })

    except Exception as e:
        logger.error(f"Error listing builds: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'code': 'LIST_ERROR'
        }), 500


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({
        'error': 'Endpoint not found',
        'code': 'NOT_FOUND'
    }), 404


@app.errorhandler(500)
def internal_error(e):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {e}", exc_info=True)
    return jsonify({
        'error': 'Internal server error',
        'code': 'INTERNAL_ERROR'
    }), 500


if __name__ == '__main__':
    logger.info(f"Starting PlatformIO Builder Service on {Config.HOST}:{Config.PORT}")
    logger.info(f"Builds directory: {Config.BUILDS_DIR}")
    logger.info(f"Debug mode: {Config.DEBUG}")

    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
        threaded=True
    )
